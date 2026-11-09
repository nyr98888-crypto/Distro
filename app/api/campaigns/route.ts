import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { detectPriority } from "@/lib/priority-detector";
import { stringifyStringArray } from "@/lib/json-fields";
import { prisma } from "@/lib/prisma";
import { schedulePublishCampaign } from "@/lib/queue";

const mediaUrlSchema = z
  .string()
  .refine(
    (value) =>
      value.startsWith("data:image/") ||
      /^https?:\/\//i.test(value),
    { message: "Invalid media URL" }
  );

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  rawContent: z.string().min(1),
  mediaUrls: z.array(mediaUrlSchema).optional().default([]),
  channelIds: z.array(z.string().uuid()).min(1),
  /** ISO datetime — enables flash priority when within 3 hours */
  eventTime: z.string().datetime({ offset: true }).optional().nullable(),
  /** Seconds between group posts when the extension executor runs */
  intervalDelay: z.number().int().min(0).max(3600).optional().default(60),
  /** When true, create PublishJobs and enqueue immediately */
  schedule: z.boolean().optional().default(true),
});

/**
 * POST /api/campaigns
 * Create a campaign and optionally enqueue PublishJobs with auto-detected priority.
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

    const parsed = createCampaignSchema.safeParse(body);
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

    const { name, rawContent, mediaUrls, channelIds, eventTime, schedule } =
      parsed.data;

    const detection = detectPriority(
      rawContent,
      eventTime ? new Date(eventTime) : null
    );

    // Ensure all channels belong to this user's accounts
    const channels = await prisma.channel.findMany({
      where: {
        id: { in: channelIds },
        isActive: true,
        account: { userId },
      },
      select: { id: true },
    });

    if (channels.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid active channels for this user" },
        { status: 400 }
      );
    }

    const ownedIds = channels.map((c) => c.id);

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name,
        rawContent,
        mediaUrls: stringifyStringArray(mediaUrls),
        status: schedule ? "SCHEDULED" : "DRAFT",
      },
      select: { id: true, name: true, status: true, createdAt: true },
    });

    let queueResult: { jobIds: string[]; queued: number } | null = null;

    if (schedule) {
      queueResult = await schedulePublishCampaign(
        campaign.id,
        ownedIds,
        detection.priority
      );
    }

    // Pending jobs for this campaign, ordered for dispatch
    const pendingJobs = await prisma.publishJob.findMany({
      where: {
        campaignId: campaign.id,
        status: { in: ["PENDING", "PENDING_APPROVAL"] },
      },
      orderBy: [{ priority: "asc" }, { scheduledFor: "asc" }],
      select: {
        id: true,
        channelId: true,
        accountId: true,
        priority: true,
        scheduledFor: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      campaign,
      priority: detection,
      jobs: pendingJobs,
      queued: queueResult?.queued ?? 0,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/campaigns
 * List the user's campaigns (newest first).
 */
export async function GET() {
  try {
    const userId = await requireAuth();

    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        rawContent: true,
        _count: { select: { jobs: true } },
      },
    });

    return NextResponse.json({ success: true, campaigns });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/GET]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
