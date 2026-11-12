import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/channels";
import { db } from "@/lib/db";
import {
  campaignToWorkerPayload,
  computeNextRunForCreate,
  fromWorkerScheduleType,
} from "@/lib/remote-worker";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

const targetGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  externalId: z.string().optional(),
  url: z.string().optional(),
});

const bodySchema = z.object({
  name: z.string().max(200).optional().default(""),
  content: z.string().min(1),
  imageUrl: z.string().optional().default(""),
  image_url: z.string().optional(),
  whatsappPhone: z.string().optional(),
  whatsapp_phone: z.string().optional(),
  whatsappMessage: z.string().optional(),
  whatsapp_message: z.string().optional(),
  targetGroups: z.array(targetGroupSchema).optional(),
  target_group_ids: z.array(z.string()).optional(),
  scheduleType: z
    .enum(["now", "immediate", "once", "recurring"])
    .optional()
    .default("now"),
  schedule_type: z.enum(["now", "immediate", "once", "recurring"]).optional(),
  scheduledTime: z.string().datetime({ offset: true }).optional().nullable(),
  targetDays: z.array(z.number().int().min(0).max(6)).optional(),
  target_days: z.array(z.number().int().min(0).max(6)).optional(),
  runTime: z.string().optional(),
  run_time: z.string().optional(),
  delaySeconds: z.number().int().min(0).max(3600).optional().default(60),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  maxRuns: z.number().int().positive().optional().nullable(),
  executionMode: z.enum(["extension", "cloud"]).optional().default("extension"),
});

/**
 * POST /api/campaigns/create
 * iPhone / desktop remote queue entry — creates a ScheduledPost with status pending (queued).
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

    const data = parsed.data;
    const accountId = await getActiveAccountId(userId);
    const scheduleType = fromWorkerScheduleType(
      data.schedule_type || data.scheduleType
    );
    const daysOfWeek = data.target_days || data.targetDays || [];
    const runTime = data.run_time || data.runTime || "07:00";
    const imageUrl = data.image_url || data.imageUrl || "";
    const phone = data.whatsapp_phone || data.whatsappPhone || "";
    const waMessage = data.whatsapp_message || data.whatsappMessage || "";

    let targetGroups = data.targetGroups || [];
    if ((!targetGroups.length) && data.target_group_ids?.length && accountId) {
      const channels = await db.channel.findMany({
        where: {
          accountId,
          id: { in: data.target_group_ids },
          isActive: true,
        },
      });
      targetGroups = channels.map((c: Record<string, unknown>) => ({
        id: String(c.id),
        name: String(c.name || ""),
        externalId: String(c.externalId || ""),
        url:
          (typeof c.url === "string" && c.url) ||
          (c.externalId
            ? `https://www.facebook.com/groups/${String(c.externalId)}`
            : undefined),
      }));
    }

    if (!targetGroups.length) {
      return NextResponse.json(
        { success: false, error: "Select at least one target group" },
        { status: 400 }
      );
    }

    if (scheduleType === "once" && !data.scheduledTime) {
      return NextResponse.json(
        { success: false, error: "scheduledTime is required for once schedules" },
        { status: 400 }
      );
    }
    if (scheduleType === "recurring" && daysOfWeek.length === 0) {
      return NextResponse.json(
        { success: false, error: "target_days is required for recurring schedules" },
        { status: 400 }
      );
    }

    const nextRunAt = await computeNextRunForCreate({
      scheduleType,
      scheduledTime: data.scheduledTime,
      daysOfWeek,
      runTime,
      endDate: data.endDate,
      maxRuns: data.maxRuns,
    });

    if (!nextRunAt) {
      return NextResponse.json(
        { success: false, error: "Could not calculate next_run_at" },
        { status: 400 }
      );
    }

    const scheduledTime =
      scheduleType === "once" && data.scheduledTime
        ? new Date(data.scheduledTime)
        : nextRunAt;

    const whatsapp =
      phone.trim().length > 0
        ? {
            phone: phone.trim(),
            message: waMessage || "",
            url: null as string | null,
          }
        : null;

    const post = await db.scheduledPost.create({
      data: {
        userId,
        accountId: accountId || null,
        name: data.name || data.content.slice(0, 80),
        content: data.content,
        imageUrl,
        targetGroups: JSON.stringify(targetGroups),
        scheduledTime,
        delaySeconds: data.delaySeconds,
        status: "pending", // queued for desktop worker
        whatsappJson: whatsapp ? JSON.stringify(whatsapp) : "",
        scheduleType,
        daysOfWeek: JSON.stringify(daysOfWeek),
        runTime,
        endDate: data.endDate ? new Date(data.endDate) : null,
        maxRuns: data.maxRuns ?? null,
        runsCount: 0,
        isActive: true,
        nextRunAt,
        executionMode: data.executionMode || "extension",
      },
      include: { publishedPosts: true },
    });

    return NextResponse.json({
      success: true,
      campaign: campaignToWorkerPayload(post as ScheduledPostRow),
      post: toScheduledPostDTO(post as ScheduledPostRow),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/create]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
