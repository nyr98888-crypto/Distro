import { prisma } from "@/lib/prisma";
import { calculateNextRun } from "@/lib/schedule-engine";
import {
  CATCHUP_WINDOW_MS,
  EXTENSION_ONLINE_MS,
  type ExecutionMode,
} from "@/lib/distro-types";
import {
  parseDaysOfWeek,
  parseTargetGroups,
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

export function isExtensionOnline(lastPing: Date | null | undefined): boolean {
  if (!lastPing) return false;
  return Date.now() - lastPing.getTime() < EXTENSION_ONLINE_MS;
}

export function isMissedWithinCatchup(
  nextRunAt: Date | null | undefined,
  now = new Date()
): boolean {
  if (!nextRunAt) return false;
  const lag = now.getTime() - nextRunAt.getTime();
  return lag > 0 && lag <= CATCHUP_WINDOW_MS;
}

export async function listDueCampaigns(now = new Date()) {
  return prisma.scheduledPost.findMany({
    where: {
      isActive: true,
      status: { in: ["pending", "failed"] },
      nextRunAt: { lte: now },
    },
    include: {
      user: { include: { deviceSession: true } },
      publishedPosts: true,
    },
    orderBy: { nextRunAt: "asc" },
  });
}

export async function listCatchupCampaignsForUser(
  userId: string,
  now = new Date()
) {
  const windowStart = new Date(now.getTime() - CATCHUP_WINDOW_MS);
  return prisma.scheduledPost.findMany({
    where: {
      userId,
      isActive: true,
      status: { in: ["pending", "failed"] },
      nextRunAt: { gte: windowStart, lte: now },
    },
    include: { publishedPosts: true },
    orderBy: { nextRunAt: "asc" },
  });
}

export function resolveExecutionMode(
  preferred: string | null | undefined,
  lastPing: Date | null | undefined
): ExecutionMode {
  if (preferred === "cloud") return "cloud";
  return isExtensionOnline(lastPing) ? "extension" : "cloud";
}

/** Advance runs_count + next_run_at after a successful broadcast. */
export async function completeCampaignRun(postId: string, userId?: string) {
  const existing = await prisma.scheduledPost.findFirst({
    where: {
      id: postId,
      ...(userId ? { userId } : {}),
    },
  });
  if (!existing) return null;

  const runsCount = existing.runsCount + 1;
  const daysOfWeek = parseDaysOfWeek(existing.daysOfWeek);
  const scheduleType =
    existing.scheduleType === "recurring"
      ? "recurring"
      : existing.scheduleType === "immediate"
        ? "immediate"
        : "once";

  const nextRunAt = calculateNextRun({
    scheduleType,
    scheduledTime: existing.scheduledTime,
    daysOfWeek,
    runTime: existing.runTime,
    endDate: existing.endDate,
    maxRuns: existing.maxRuns,
    runsCount,
    isActive: true,
  });

  const done =
    !nextRunAt ||
    scheduleType === "once" ||
    scheduleType === "immediate" ||
    (existing.maxRuns != null && runsCount >= existing.maxRuns);

  const updated = await prisma.scheduledPost.update({
    where: { id: postId },
    data: {
      runsCount,
      nextRunAt: done ? null : nextRunAt,
      isActive: !done,
      status: done ? "completed" : "pending",
    },
    include: { publishedPosts: true },
  });

  return toScheduledPostDTO(updated as ScheduledPostRow);
}

export async function dispatchCloudFallback(campaign: {
  id: string;
  userId: string;
  name: string;
  content: string;
  imageUrl: string;
  targetGroups: string;
  delaySeconds: number;
}) {
  const workerUrl = process.env.DISTRO_CLOUD_WORKER_URL;
  const payload = {
    campaignId: campaign.id,
    userId: campaign.userId,
    name: campaign.name,
    content: campaign.content,
    imageUrl: campaign.imageUrl,
    targetGroups: parseTargetGroups(campaign.targetGroups),
    delaySeconds: campaign.delaySeconds,
  };

  if (!workerUrl) {
    console.warn(
      "[hybrid] DISTRO_CLOUD_WORKER_URL unset — queued cloud job locally",
      campaign.id
    );
    await prisma.scheduledPost.update({
      where: { id: campaign.id },
      data: {
        status: "pending",
        errorMessage: "cloud_queued_no_worker",
        executionMode: "cloud",
      },
    });
    return { dispatched: false, reason: "no_worker" as const };
  }

  const res = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.DISTRO_CLOUD_WORKER_SECRET
        ? { Authorization: `Bearer ${process.env.DISTRO_CLOUD_WORKER_SECRET}` }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await prisma.scheduledPost.update({
      where: { id: campaign.id },
      data: {
        status: "failed",
        errorMessage: `cloud_dispatch_failed:${res.status}:${text.slice(0, 200)}`,
      },
    });
    return { dispatched: false, reason: "worker_error" as const };
  }

  await prisma.scheduledPost.update({
    where: { id: campaign.id },
    data: { status: "running", executionMode: "cloud", errorMessage: "" },
  });
  return { dispatched: true as const };
}
