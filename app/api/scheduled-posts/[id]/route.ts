import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateNextRun } from "@/lib/schedule-engine";
import {
  SCHEDULED_POST_STATUSES,
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  externalId: z.string().optional(),
  url: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().max(200).optional(),
  content: z.string().min(1).optional(),
  imageUrl: z.string().optional(),
  targetGroups: z.array(groupSchema).min(1).optional(),
  scheduledTime: z.string().datetime({ offset: true }).optional().nullable(),
  delaySeconds: z.number().int().min(0).max(3600).optional(),
  status: z.enum(SCHEDULED_POST_STATUSES).optional(),
  errorMessage: z.string().optional(),
  scheduleType: z.enum(["immediate", "once", "recurring"]).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  runTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  maxRuns: z.number().int().min(1).max(10000).optional().nullable(),
  runsCount: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  nextRunAt: z.string().datetime({ offset: true }).optional().nullable(),
  executionMode: z.enum(["extension", "cloud"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;
    const post = await db.scheduledPost.findFirst({
      where: { id, userId },
      include: { publishedPosts: { orderBy: { createdAt: "desc" } } },
    });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      success: true,
      post: toScheduledPostDTO(post as ScheduledPostRow),
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

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const existing = await db.scheduledPost.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const data = parsed.data;

    const scheduleType = data.scheduleType ?? existing.scheduleType;
    const daysOfWeek =
      data.daysOfWeek ??
      (JSON.parse(existing.daysOfWeek || "[]") as number[]);
    const runTime = data.runTime ?? existing.runTime;
    const endDate =
      data.endDate !== undefined
        ? data.endDate
          ? new Date(data.endDate)
          : null
        : existing.endDate;
    const maxRuns =
      data.maxRuns !== undefined ? data.maxRuns : existing.maxRuns;
    const runsCount =
      data.runsCount !== undefined ? data.runsCount : existing.runsCount;
    const isActive =
      data.isActive !== undefined ? data.isActive : existing.isActive;
    const scheduledTime =
      data.scheduledTime !== undefined && data.scheduledTime
        ? new Date(data.scheduledTime)
        : existing.scheduledTime;

    let nextRunAt =
      data.nextRunAt !== undefined
        ? data.nextRunAt
          ? new Date(data.nextRunAt)
          : null
        : existing.nextRunAt;

    // Recompute next run when schedule knobs change or after a run increment
    const shouldRecompute =
      data.scheduleType !== undefined ||
      data.daysOfWeek !== undefined ||
      data.runTime !== undefined ||
      data.endDate !== undefined ||
      data.maxRuns !== undefined ||
      data.runsCount !== undefined ||
      data.scheduledTime !== undefined ||
      data.isActive !== undefined;

    if (shouldRecompute && data.nextRunAt === undefined) {
      nextRunAt = calculateNextRun({
        scheduleType:
          scheduleType === "recurring"
            ? "recurring"
            : scheduleType === "immediate"
              ? "immediate"
              : "once",
        scheduledTime,
        daysOfWeek,
        runTime,
        endDate,
        maxRuns,
        runsCount,
        isActive,
      });
    }

    const post = await db.scheduledPost.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.content !== undefined ? { content: data.content } : {}),
        ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
        ...(data.targetGroups
          ? { targetGroups: JSON.stringify(data.targetGroups) }
          : {}),
        ...(data.scheduledTime !== undefined
          ? { scheduledTime: scheduledTime }
          : {}),
        ...(data.delaySeconds !== undefined
          ? { delaySeconds: data.delaySeconds }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.errorMessage !== undefined
          ? { errorMessage: data.errorMessage }
          : {}),
        ...(data.scheduleType !== undefined
          ? { scheduleType: data.scheduleType }
          : {}),
        ...(data.daysOfWeek !== undefined
          ? { daysOfWeek: JSON.stringify(data.daysOfWeek) }
          : {}),
        ...(data.runTime !== undefined ? { runTime: data.runTime } : {}),
        ...(data.endDate !== undefined ? { endDate } : {}),
        ...(data.maxRuns !== undefined ? { maxRuns } : {}),
        ...(data.runsCount !== undefined ? { runsCount } : {}),
        ...(data.isActive !== undefined ? { isActive } : {}),
        ...(data.executionMode !== undefined
          ? { executionMode: data.executionMode }
          : {}),
        nextRunAt,
        // Soft lifecycle defaults when pausing/deactivating without explicit status
        ...(data.status === undefined &&
        data.isActive === false &&
        (existing.status === "pending" || existing.status === "running")
          ? { status: "paused" }
          : {}),
        ...(data.status === undefined &&
        data.isActive === true &&
        existing.status === "paused"
          ? { status: "pending" }
          : {}),
      },
    });

    const withPublished = await db.scheduledPost.findFirst({
      where: { id },
      include: { publishedPosts: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({
      success: true,
      post: toScheduledPostDTO((withPublished || post) as ScheduledPostRow),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[scheduled-posts/PATCH]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;
    const existing = await db.scheduledPost.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    if (
      existing.status === "pending" ||
      existing.status === "running" ||
      existing.status === "paused"
    ) {
      const post = await db.scheduledPost.update({
        where: { id },
        data: { status: "cancelled", isActive: false, nextRunAt: null },
      });
      return NextResponse.json({
        success: true,
        post: toScheduledPostDTO(post as ScheduledPostRow),
      });
    }

    await db.scheduledPost.delete({ where: { id } });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[scheduled-posts/DELETE]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
