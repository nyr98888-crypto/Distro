import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  getActiveConnectedAccount,
  parseStoredSession,
} from "@/lib/facebook-accounts";
import {
  GRAPH_VERSION,
  syncGroupsFromGraph,
} from "@/lib/facebook-oauth";
import { db } from "@/lib/db";
import {
  TEST_FACEBOOK_GROUPS,
  TEST_GROUP_TAG,
} from "@/lib/test-groups";

const groupSchema = z.object({
  facebookGroupId: z.string().regex(/^\d{5,}$/).optional(),
  id: z.string().regex(/^\d{5,}$/).optional(),
  name: z.string().min(1),
  memberCount: z.number().int().nonnegative().optional(),
  url: z.string().optional().or(z.literal("")),
});

const addTestGroupSchema = z.object({
  name: z.string().min(1).max(200),
  memberCount: z.number().int().nonnegative().optional(),
  facebookGroupId: z.string().regex(/^\d{5,}$/).optional(),
});

const bodySchema = z.object({
  /** When true (default), seed test groups if Graph returns 0 targets. */
  seedIfEmpty: z.boolean().optional().default(true),
  groups: z.array(groupSchema).optional(),
  addTestGroup: addTestGroupSchema.optional(),
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

async function seedTestGroups(accountId: string): Promise<number> {
  let count = 0;
  for (const g of TEST_FACEBOOK_GROUPS) {
    await upsertChannel(accountId, {
      externalId: g.facebookGroupId,
      name: g.name,
      memberCount: g.memberCount,
      url: g.url,
      tags: JSON.stringify([TEST_GROUP_TAG, "פייסבוק"]),
    });
    count += 1;
  }
  return count;
}

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/groups/sync
 *
 * Standalone Vercel flow (no Chrome extension):
 * 1. Sync Pages/groups via Graph using the stored OAuth token
 * 2. If Graph returns 0 targets, seed 5 Hebrew test groups into Turso
 * 3. Optionally append a custom test group (`addTestGroup`)
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
    const seedIfEmpty = body.seedIfEmpty !== false;

    const account = await getActiveConnectedAccount(userId);
    if (!account) {
      return corsJson(
        {
          success: false,
          error: "No Facebook account linked — sign in with Facebook first",
          needsReauth: true,
        },
        { status: 404 }
      );
    }

    const stored = parseStoredSession(String(account.accessToken || ""));
    const oauthToken = stored.oauthAccessToken?.trim() || "";

    let graphCount = 0;
    let seeded = false;
    let source: "graph" | "seed" | "manual" | "mixed" = "graph";

    // 1) Graph: pages (me/accounts) + groups (best-effort)
    if (oauthToken) {
      try {
        graphCount = await syncGroupsFromGraph(account.id, oauthToken);
      } catch (error) {
        console.warn("[groups/sync] Graph sync failed:", error);
      }

      // Explicit me/accounts check for logging / zero detection
      if (graphCount === 0) {
        try {
          const pagesUrl = new URL(
            `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
          );
          pagesUrl.searchParams.set("fields", "id,name,fan_count,link");
          pagesUrl.searchParams.set("limit", "100");
          pagesUrl.searchParams.set("access_token", oauthToken);
          const pagesRes = await fetch(pagesUrl.toString(), { method: "GET" });
          const pagesJson = (await pagesRes.json()) as {
            data?: unknown[];
            error?: { message?: string };
          };
          const pageLen = Array.isArray(pagesJson.data)
            ? pagesJson.data.length
            : 0;
          if (!pagesRes.ok || pagesJson.error) {
            console.warn(
              "[groups/sync] me/accounts:",
              pagesJson.error?.message || `HTTP ${pagesRes.status}`
            );
          } else if (pageLen === 0) {
            console.info(
              "[groups/sync] me/accounts returned 0 — will seed test groups"
            );
          }
        } catch (error) {
          console.warn("[groups/sync] me/accounts probe failed:", error);
        }
      }
    }

    // Manual groups from body (extension-compatible or tester paste)
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
        graphCount += 1;
      }
      source = oauthToken ? "mixed" : "manual";
    }

    // Custom single test group
    if (body.addTestGroup) {
      const id =
        body.addTestGroup.facebookGroupId ||
        String(910000000000000 + Math.floor(Math.random() * 899999999999));
      await upsertChannel(account.id, {
        externalId: id,
        name: body.addTestGroup.name,
        memberCount: body.addTestGroup.memberCount ?? 1000,
        url: `https://www.facebook.com/groups/${id}`,
        tags: JSON.stringify([TEST_GROUP_TAG, "פייסבוק"]),
      });
      source = source === "graph" && graphCount === 0 ? "manual" : "mixed";
    }

    // 2) Seed if empty after Graph
    const activeCount = await db.channel.count({
      where: { accountId: account.id, isActive: true },
    });

    if (seedIfEmpty && activeCount === 0 && !body.addTestGroup) {
      const seededCount = await seedTestGroups(account.id);
      graphCount = seededCount;
      seeded = true;
      source = "seed";
    } else if (seedIfEmpty && graphCount === 0 && activeCount === 0) {
      const seededCount = await seedTestGroups(account.id);
      graphCount = seededCount;
      seeded = true;
      source = "seed";
    }

    await db.connectedAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: "ACTIVE", isActive: true },
    });

    const accountId =
      (await getActiveAccountId(userId)) || account.id;
    const channels = await listChannelsForAccount(accountId);

    const res = corsJson({
      success: true,
      syncedCount: channels.filter((c) => c.isActive).length,
      channelCount: channels.length,
      channels,
      seeded,
      source,
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
