import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { completeCampaignRun } from "@/lib/hybrid-scheduler";
import { db } from "@/lib/db";
import {
  campaignToWorkerPayload,
  fromWorkerStatus,
  touchDeviceWorker,
} from "@/lib/remote-worker";
import type { ScheduledPostRow } from "@/lib/scheduled-posts";

const bodySchema = z.object({
  campaignId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  status: z.enum([
    "queued",
    "processing",
    "completed",
    "paused",
    "pending",
    "running",
    "failed",
    "cancelled",
  ]),
  errorMessage: z.string().max(2000).optional(),
  groupResults: z
    .array(
      z.object({
        groupId: z.string().optional(),
        groupName: z.string().optional(),
        groupExternalId: z.string().optional(),
        postUrl: z.string().optional(),
        postFbId: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .optional(),
});

/**
 * POST /api/worker/status-update
 * Extension reports progress while broadcasting / after completion.
 */
export async function POST(request: NextRequest) {
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

    const parsed = bodySchema.safeParse(body);
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

    const campaignId = parsed.data.campaignId || parsed.data.id;
    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: "campaignId is required" },
        { status: 400 }
      );
    }

    const existing = await db.scheduledPost.findFirst({
      where: { id: campaignId, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    await touchDeviceWorker({
      userId,
      accountId: existing.accountId,
      isOnline: true,
    });

    const internalStatus = fromWorkerStatus(parsed.data.status);

    if (parsed.data.groupResults?.length) {
      for (const g of parsed.data.groupResults) {
        if (!g.postUrl) continue;
        await db.publishedGroupPost.create({
          data: {
            scheduledPostId: campaignId,
            groupId: g.groupId || "",
            groupName: g.groupName || "",
            groupExternalId: g.groupExternalId || "",
            postUrl: g.postUrl,
            postFbId: g.postFbId || "",
            status: g.status || "live",
          },
        });
      }
    }

    if (internalStatus === "completed") {
      const completed = await completeCampaignRun(campaignId, userId);
      if (!completed) {
        return NextResponse.json(
          { success: false, error: "Failed to complete campaign" },
          { status: 500 }
        );
      }
      const row = await db.scheduledPost.findFirst({
        where: { id: campaignId },
        include: { publishedPosts: true },
      });
      return NextResponse.json({
        success: true,
        campaign: row
          ? campaignToWorkerPayload(row as ScheduledPostRow)
          : null,
        post: completed,
      });
    }

    const updated = await db.scheduledPost.update({
      where: { id: campaignId },
      data: {
        status: internalStatus,
        ...(parsed.data.errorMessage
          ? { errorMessage: parsed.data.errorMessage }
          : {}),
        ...(internalStatus === "paused" ? { isActive: false } : {}),
        ...(internalStatus === "pending" || internalStatus === "running"
          ? { isActive: true }
          : {}),
      },
      include: { publishedPosts: true },
    });

    return NextResponse.json({
      success: true,
      campaign: campaignToWorkerPayload(updated as ScheduledPostRow),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[worker/status-update]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
