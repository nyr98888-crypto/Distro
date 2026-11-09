import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateNextRun } from "@/lib/schedule-engine";
import { getActiveAccountId } from "@/lib/channels";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

const groupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  externalId: z.string().optional(),
  url: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().max(200).optional().default(""),
  content: z.string().min(1),
  imageUrl: z.string().optional().default(""),
  targetGroups: z.array(groupSchema).min(1),
  scheduledTime: z.string().datetime({ offset: true }).optional().nullable(),
  delaySeconds: z.number().int().min(0).max(3600).optional().default(60),
  scheduleType: z
    .enum(["immediate", "once", "recurring"])
    .optional()
    .default("once"),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().default([]),
  runTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional()
    .default("07:00"),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  maxRuns: z.number().int().min(1).max(10000).optional().nullable(),
  executionMode: z.enum(["extension", "cloud"]).optional().default("extension"),
  whatsapp: z
    .object({
      phone: z.string(),
      message: z.string(),
      url: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

/** GET /api/scheduled-posts */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth();
    const accountId = await getActiveAccountId(userId);
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const status = searchParams.get("status");

    const lifecycle = searchParams.get("lifecycle"); // active | paused | completed | all

    const posts = await prisma.scheduledPost.findMany({
      where: {
        userId,
        ...(accountId ? { accountId } : { accountId: null }),
        ...(status ? { status } : {}),
        ...(lifecycle === "active"
          ? { isActive: true, status: { in: ["pending", "running"] } }
          : lifecycle === "paused"
            ? { status: "paused" }
            : lifecycle === "completed"
              ? {
                  OR: [
                    { status: { in: ["completed", "cancelled"] } },
                    { isActive: false, status: { not: "paused" } },
                  ],
                }
              : {}),
        ...(from || to
          ? {
              OR: [
                {
                  scheduledTime: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                },
                {
                  nextRunAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                },
                { scheduleType: "recurring", isActive: true },
              ],
            }
          : {}),
      },
      include: { publishedPosts: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ updatedAt: "desc" }, { scheduledTime: "asc" }],
    });

    return NextResponse.json({
      success: true,
      posts: posts.map((p) => toScheduledPostDTO(p as ScheduledPostRow)),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[scheduled-posts/GET]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** POST /api/scheduled-posts */
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

    const parsed = createSchema.safeParse(body);
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
    const scheduleType = data.scheduleType;

    if (scheduleType === "once" && !data.scheduledTime) {
      return NextResponse.json(
        { success: false, error: "נדרש מועד פרסום חד-פעמי" },
        { status: 400 }
      );
    }
    if (scheduleType === "recurring" && data.daysOfWeek.length === 0) {
      return NextResponse.json(
        { success: false, error: "נא לבחור לפחות יום אחד למחזור" },
        { status: 400 }
      );
    }

    const scheduledTimeInput =
      scheduleType === "immediate"
        ? new Date(Date.now() + 2_000).toISOString()
        : data.scheduledTime;

    const nextRunAt = calculateNextRun({
      scheduleType,
      scheduledTime: scheduledTimeInput,
      daysOfWeek: data.daysOfWeek,
      runTime: data.runTime,
      endDate: data.endDate,
      maxRuns: data.maxRuns,
      runsCount: 0,
      isActive: true,
    });

    if (!nextRunAt) {
      return NextResponse.json(
        { success: false, error: "לא ניתן לחשב מועד ריצה הבא לתזמון זה" },
        { status: 400 }
      );
    }

    const scheduledTime =
      scheduleType === "once" && data.scheduledTime
        ? new Date(data.scheduledTime)
        : nextRunAt;

    const post = await prisma.scheduledPost.create({
      data: {
        userId,
        accountId: accountId || null,
        name: data.name || data.content.slice(0, 80),
        content: data.content,
        imageUrl: data.imageUrl || "",
        targetGroups: JSON.stringify(data.targetGroups),
        scheduledTime,
        delaySeconds: data.delaySeconds,
        status: "pending",
        whatsappJson: data.whatsapp ? JSON.stringify(data.whatsapp) : "",
        scheduleType,
        daysOfWeek: JSON.stringify(data.daysOfWeek),
        runTime: data.runTime,
        endDate: data.endDate ? new Date(data.endDate) : null,
        maxRuns: data.maxRuns ?? null,
        runsCount: 0,
        isActive: true,
        nextRunAt,
        executionMode: data.executionMode || "extension",
      },
    });

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
    console.error("[scheduled-posts/POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
