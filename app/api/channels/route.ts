import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  computeChannelStats,
  getActiveAccountId,
  listChannelsForAccount,
  toChannelDTO,
} from "@/lib/channels";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { mergeTags, stringifyStringArray } from "@/lib/json-fields";
import { db } from "@/lib/db";

/**
 * GET /api/channels?accountId=optional
 * Returns all channels for the authenticated user's active account.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();
    const preferredAccountId =
      request.nextUrl.searchParams.get("accountId") ?? undefined;

    const accountId = await getActiveAccountId(userId, preferredAccountId);
    if (!accountId) {
      return NextResponse.json({
        success: true,
        accountId: null,
        channels: [],
        stats: { totalChannels: 0, activeChannels: 0, totalReach: 0 },
      });
    }

    const channels = await listChannelsForAccount(accountId);
    return NextResponse.json({
      success: true,
      accountId,
      channels,
      stats: computeChannelStats(channels),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[channels/GET]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

const patchSchema = z
  .object({
    channelIds: z.array(z.string().uuid()).min(1),
    accountId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
    /** Replace tags entirely */
    categoryTags: z.array(z.string().min(1)).optional(),
    /** Merge these tags into each channel's existing list */
    addTags: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) =>
      data.isActive !== undefined ||
      data.categoryTags !== undefined ||
      data.addTags !== undefined,
    { message: "Provide isActive, categoryTags, and/or addTags" }
  );

/**
 * PATCH /api/channels
 * Bulk-update tags and/or toggle isActive for selected channels.
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuth();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { channelIds, isActive, categoryTags, addTags } = parsed.data;
    const accountId = await getActiveAccountId(userId, parsed.data.accountId);

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: "No active connected account" },
        { status: 404 }
      );
    }

    const owned = await db.channel.findMany({
      where: {
        id: { in: channelIds },
        accountId,
      },
    });

    if (owned.length === 0) {
      return NextResponse.json(
        { success: false, error: "No matching channels found" },
        { status: 404 }
      );
    }

    const updated = await db.$transaction(
      owned.map((channel: any) => {
        let nextTags = channel.categoryTags;

        if (categoryTags !== undefined) {
          nextTags = stringifyStringArray(
            [...new Set(categoryTags.map((t: any) => t.trim()).filter(Boolean))].sort()
          );
        } else if (addTags !== undefined && addTags.length > 0) {
          nextTags = mergeTags(channel.categoryTags, addTags);
        }

        return db.channel.update({
          where: { id: channel.id },
          data: {
            ...(isActive !== undefined ? { isActive } : {}),
            ...(nextTags !== channel.categoryTags
              ? { categoryTags: nextTags }
              : {}),
          },
        });
      })
    );

    return NextResponse.json({
      success: true,
      updated: updated.map(toChannelDTO),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[channels/PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
