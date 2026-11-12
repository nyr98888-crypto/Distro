import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { db } from "@/lib/db";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * GET /api/campaigns/due
 *
 * Due scheduled campaigns for the authenticated user (cookie or Bearer
 * extension session token). A campaign is due when isActive and status is
 * pending/failed and (nextRunAt <= now OR scheduledTime <= now).
 */
export async function GET() {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();
    const now = new Date();

    const byNext = await db.scheduledPost.findMany({
      where: {
        userId,
        isActive: true,
        status: { in: ["pending", "failed"] },
        nextRunAt: { lte: now },
      },
      include: { publishedPosts: true },
      orderBy: { nextRunAt: "asc" },
      take: 50,
    });

    const byScheduled = await db.scheduledPost.findMany({
      where: {
        userId,
        isActive: true,
        status: { in: ["pending", "failed"] },
        scheduledTime: { lte: now },
      },
      include: { publishedPosts: true },
      orderBy: { scheduledTime: "asc" },
      take: 50,
    });

    const byId = new Map<string, ScheduledPostRow>();
    for (const row of [...byNext, ...byScheduled] as ScheduledPostRow[]) {
      if (!row?.id) continue;
      // Prefer rows that already have nextRunAt in the past
      if (!byId.has(row.id)) byId.set(row.id, row);
    }

    const campaigns = Array.from(byId.values())
      .filter((row) => {
        const next = row.nextRunAt ? new Date(row.nextRunAt).getTime() : null;
        const sched = row.scheduledTime
          ? new Date(row.scheduledTime).getTime()
          : null;
        const dueAt = next ?? sched;
        return dueAt != null && dueAt <= now.getTime();
      })
      .map((row) => toScheduledPostDTO(row));

    const res = corsJson({
      success: true,
      campaigns,
      count: campaigns.length,
      serverTime: now.toISOString(),
    });
    return applyCorsHeaders(res);
  } catch (error) {
    if (error instanceof AuthError) {
      return corsJson(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/due]", error);
    return corsJson(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
