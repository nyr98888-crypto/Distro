import { db } from "@/lib/db";
import { getActiveAccountId } from "@/lib/channels";
import { calculateNextRun } from "@/lib/schedule-engine";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

/** Map internal statuses ↔ remote worker vocabulary. */
export function toWorkerStatus(status: string): string {
  if (status === "pending" || status === "failed") return "queued";
  if (status === "running") return "processing";
  return status;
}

export function fromWorkerStatus(status: string): string {
  if (status === "queued") return "pending";
  if (status === "processing") return "running";
  if (status === "now") return "pending";
  return status;
}

export function toWorkerScheduleType(scheduleType: string): string {
  if (scheduleType === "immediate") return "now";
  return scheduleType;
}

export function fromWorkerScheduleType(
  scheduleType: string
): "immediate" | "once" | "recurring" {
  if (scheduleType === "now" || scheduleType === "immediate") return "immediate";
  if (scheduleType === "recurring") return "recurring";
  return "once";
}

export function campaignToWorkerPayload(row: ScheduledPostRow) {
  const dto = toScheduledPostDTO(row);
  const whatsapp = (() => {
    try {
      return row.whatsappJson ? JSON.parse(row.whatsappJson) : null;
    } catch {
      return null;
    }
  })();
  return {
    // Extension-compatible shape (DTO first; worker fields override below)
    ...dto,
    id: dto.id,
    account_id: row.accountId || null,
    name: dto.name,
    content: dto.content,
    image_url: dto.imageUrl,
    whatsapp_phone: whatsapp?.phone || "",
    whatsapp_message: whatsapp?.message || "",
    target_group_ids: (Array.isArray(dto.targetGroups) ? dto.targetGroups : []).map(
      (g: any) => g?.id
    ).filter(Boolean),
    target_groups: Array.isArray(dto.targetGroups) ? dto.targetGroups : [],
    schedule_type: toWorkerScheduleType(dto.scheduleType),
    target_days: Array.isArray(dto.daysOfWeek) ? dto.daysOfWeek : [],
    run_time: dto.runTime,
    status: toWorkerStatus(dto.status),
    delay_seconds: dto.delaySeconds,
    created_at: dto.createdAt,
    next_run_at: dto.nextRunAt,
  };
}

export async function touchDeviceWorker(opts: {
  userId: string;
  accountId?: string | null;
  isOnline?: boolean;
}) {
  const accountId =
    opts.accountId || (await getActiveAccountId(opts.userId));
  if (!accountId) return null;

  const now = new Date();
  return db.deviceWorker.upsert({
    where: { accountId },
    create: {
      accountId,
      lastSeenAt: now,
      isOnline: opts.isOnline !== false,
    },
    update: {
      lastSeenAt: now,
      isOnline: opts.isOnline !== false,
    },
  });
}

export async function listQueuedCampaignsForWorker(
  userId: string,
  now = new Date()
) {
  return db.scheduledPost.findMany({
    where: {
      userId,
      isActive: true,
      status: { in: ["pending", "failed"] },
      nextRunAt: { lte: now },
    },
    include: { publishedPosts: true },
    orderBy: { nextRunAt: "asc" },
    take: 5,
  });
}

export async function computeNextRunForCreate(input: {
  scheduleType: "immediate" | "once" | "recurring";
  scheduledTime?: string | null;
  daysOfWeek: number[];
  runTime: string;
  endDate?: string | null;
  maxRuns?: number | null;
}) {
  const scheduledTimeInput =
    input.scheduleType === "immediate"
      ? new Date(Date.now() + 2_000).toISOString()
      : input.scheduledTime;

  return calculateNextRun({
    scheduleType: input.scheduleType,
    scheduledTime: scheduledTimeInput,
    daysOfWeek: input.daysOfWeek,
    runTime: input.runTime,
    endDate: input.endDate,
    maxRuns: input.maxRuns,
    runsCount: 0,
    isActive: true,
  });
}

export type { ScheduledPostRow };
