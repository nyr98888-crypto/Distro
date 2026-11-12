import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/channels";
import {
  campaignToWorkerPayload,
  listQueuedCampaignsForWorker,
  touchDeviceWorker,
} from "@/lib/remote-worker";
import type { ScheduledPostRow } from "@/lib/scheduled-posts";

const querySchema = z.object({
  accountId: z.string().uuid().optional(),
});

/**
 * GET /api/worker/poll
 * Desktop Chrome extension polls ~every 45–60s.
 * Touches device_workers heartbeat and returns due queued campaigns.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const parsed = querySchema.safeParse({
      accountId: request.nextUrl.searchParams.get("accountId") || undefined,
    });
    const accountId =
      parsed.success && parsed.data.accountId
        ? parsed.data.accountId
        : await getActiveAccountId(userId);

    const worker = await touchDeviceWorker({
      userId,
      accountId,
      isOnline: true,
    });

    const rows = await listQueuedCampaignsForWorker(userId);
    const campaigns = rows.map((r: any) =>
      campaignToWorkerPayload(r as ScheduledPostRow)
    );

    return NextResponse.json({
      success: true,
      worker: worker
        ? {
            id: worker.id,
            account_id: worker.accountId,
            last_seen_at:
              typeof worker.lastSeenAt?.toISOString === "function"
                ? worker.lastSeenAt.toISOString()
                : String(worker.lastSeenAt ?? new Date().toISOString()),
            is_online: worker.isOnline,
          }
        : null,
      campaigns,
      // Alias for extension convenience
      jobs: campaigns,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[worker/poll]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Also accept POST so the extension can send a heartbeat body. */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    let accountId: string | null = null;
    try {
      const body = (await request.json()) as { accountId?: string };
      accountId = body.accountId || null;
    } catch {
      accountId = null;
    }
    if (!accountId) accountId = await getActiveAccountId(userId);

    await touchDeviceWorker({ userId, accountId, isOnline: true });
    const rows = await listQueuedCampaignsForWorker(userId);
    const campaigns = rows.map((r: any) =>
      campaignToWorkerPayload(r as ScheduledPostRow)
    );

    return NextResponse.json({
      success: true,
      campaigns,
      jobs: campaigns,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[worker/poll/POST]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
