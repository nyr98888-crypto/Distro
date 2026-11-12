import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { cleanupSeedChannels } from "@/lib/cleanup-seed-groups";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  getActiveConnectedAccount,
  parseStoredSession,
} from "@/lib/facebook-accounts";
import { syncGroupsFromGraph } from "@/lib/facebook-oauth";
import { db } from "@/lib/db";

const groupSchema = z.object({
  facebookGroupId: z.string().regex(/^\d{5,}$/).optional(),
  id: z.string().regex(/^\d{5,}$/).optional(),
  name: z.string().min(1),
  memberCount: z.number().int().nonnegative().optional(),
  url: z.string().optional().or(z.literal("")),
});

const bodySchema = z.object({
  /** Real groups scraped by the Chrome extension (preferred). */
  groups: z.array(groupSchema).optional(),
  /** One-shot: purge known mockup rows even when no groups are sent. */
  cleanupFakes: z.boolean().optional().default(true),
});

const DEFAULT_TAGS = JSON.stringify(["פייסבוק", "אישי"]);

async function upsertChannel(
  accountId: string,
  item: {
    externalId: string;
    name: string;
    memberCount?: number;
    url?: string;
    tags?: string;
  }
) {
  const existing = await db.channel.findFirst({
    where: { accountId, externalId: item.externalId },
  });
  const url =
    (item.url && item.url.trim()) ||
    `https://www.facebook.com/groups/${item.externalId}`;
  const memberCount = item.memberCount ?? 0;
  const categoryTags = item.tags || DEFAULT_TAGS;

  if (existing) {
    return db.channel.update({
      where: { id: existing.id },
      data: {
        name: item.name,
        memberCount:
          memberCount > 0 ? memberCount : existing.memberCount || 0,
        url,
        categoryTags,
        isActive: true,
      },
    });
  }

  return db.channel.create({
    data: {
      accountId,
      externalId: item.externalId,
      name: item.name,
      memberCount,
      url,
      categoryTags,
      isActive: true,
      isApprovalRequired: false,
    },
  });
}

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/groups/sync
 *
 * Upsert real Facebook groups only (extension scrape preferred).
 * Graph pages sync is best-effort and never seeds fakes.
 * Always purges known mockup test groups from Turso when cleanupFakes is true.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      raw = {};
    }

    const parsed = bodySchema.safeParse(
      raw && typeof raw === "object" ? raw : {}
    );
    if (!parsed.success) {
      return corsJson(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const cleanupFakes = body.cleanupFakes !== false;

    let removedFakes = 0;
    if (cleanupFakes) {
      try {
        removedFakes = await cleanupSeedChannels();
      } catch (error) {
        console.warn("[groups/sync] fake cleanup failed:", error);
      }
    }

    const account = await getActiveConnectedAccount(userId);
    if (!account) {
      return corsJson(
        {
          success: false,
          error: "No Facebook account linked — sign in with Facebook first",
          needsReauth: true,
          removedFakes,
          extensionRequired: true,
          message:
            "Install the DISTRO Chrome extension and sync from /dashboard/channels",
        },
        { status: 404 }
      );
    }

    const stored = parseStoredSession(String(account.accessToken || ""));
    const oauthToken = stored.oauthAccessToken?.trim() || "";

    let graphCount = 0;
    let extensionCount = 0;
    let source: "extension" | "graph" | "mixed" | "empty" = "empty";

    // 1) Best-effort Graph pages (never seeds fakes)
    if (oauthToken) {
      try {
        graphCount = await syncGroupsFromGraph(account.id, oauthToken);
      } catch (error) {
        console.warn("[groups/sync] Graph sync failed:", error);
      }
    }

    // 2) Real groups from Chrome extension scrape
    if (body.groups?.length) {
      for (const g of body.groups) {
        const externalId = g.facebookGroupId || g.id;
        if (!externalId) continue;
        await upsertChannel(account.id, {
          externalId,
          name: g.name,
          memberCount: g.memberCount,
          url: g.url,
        });
        extensionCount += 1;
      }
    }

    if (extensionCount > 0 && graphCount > 0) source = "mixed";
    else if (extensionCount > 0) source = "extension";
    else if (graphCount > 0) source = "graph";
    else source = "empty";

    await db.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: "ACTIVE", isActive: true },
    });

    const accountId =
      (await getActiveAccountId(userId)) || account.id;
    const channels = await listChannelsForAccount(accountId);
    const activeCount = channels.filter((c) => c.isActive).length;

    const extensionRequired = activeCount === 0 && extensionCount === 0;
    const message = extensionRequired
      ? "No real groups found. Install the DISTRO Chrome extension, stay logged into Facebook, then click Sync Groups."
      : undefined;

    const res = corsJson({
      success: true,
      syncedCount: activeCount,
      channelCount: channels.length,
      channels,
      extensionCount,
      graphCount,
      removedFakes,
      source,
      extensionRequired,
      message,
      accountId,
    });
    return applyCorsHeaders(res);
  } catch (error) {
    if (error instanceof AuthError) {
      return corsJson(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[groups/sync]", error);
    return corsJson(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Group sync failed",
      },
      { status: 500 }
    );
  }
}

/** GET — list channels for the active account (convenience). */
export async function GET() {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();
    const accountId = await getActiveAccountId(userId);
    const channels = accountId
      ? await listChannelsForAccount(accountId)
      : [];
    return NextResponse.json({
      success: true,
      channels,
      channelCount: channels.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
