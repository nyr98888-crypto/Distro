import "server-only";

import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";

// ─── Redis connection ─────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let connection: IORedis | null = null;
let queue: Queue<PublishJobPayload> | null = null;

function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return connection;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export const PUBLISH_QUEUE_NAME = "publish-queue";

export type PublishJobPayload = {
  publishJobId: string;
  campaignId: string;
  channelId: string;
  accountId: string;
  priority: number;
};

/**
 * Lazy BullMQ queue — avoids connecting during `next build`.
 */
export function getPublishQueue(): Queue<PublishJobPayload> {
  if (!queue) {
    queue = new Queue<PublishJobPayload>(PUBLISH_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 30_000,
        },
      },
    });
  }
  return queue;
}

/** @deprecated Prefer getPublishQueue() */
export const publishQueue = {
  add: (...args: Parameters<Queue<PublishJobPayload>["add"]>) =>
    getPublishQueue().add(...args),
  getJob: (...args: Parameters<Queue<PublishJobPayload>["getJob"]>) =>
    getPublishQueue().getJob(...args),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JITTER_MIN_MS = 90_000; // 90 seconds
const JITTER_MAX_MS = 150_000; // 150 seconds

/** Random delay in [90s, 150s] — human-like spacing between posts. */
export function humanJitterMs(): number {
  return (
    Math.floor(Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1)) +
    JITTER_MIN_MS
  );
}

/**
 * Schedule a campaign across one or more channels.
 *
 * 1. Looks up each Channel → resolves its accountId.
 * 2. Creates PublishJob rows in Postgres (status PENDING).
 * 3. Enqueues BullMQ jobs with staggered delays so that jobs
 *    sharing the same accountId are spaced 90–150 s apart.
 *
 * Priority: 1 = urgent flash … 5 = default … higher = lower urgency.
 */
export async function schedulePublishCampaign(
  campaignId: string,
  channelIds: string[],
  priority = 5
): Promise<{ jobIds: string[]; queued: number }> {
  if (channelIds.length === 0) {
    throw new Error("At least one channelId is required");
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  });

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaignId}`);
  }

  const channels = await prisma.channel.findMany({
    where: {
      id: { in: channelIds },
      isActive: true,
    },
    select: {
      id: true,
      accountId: true,
      isApprovalRequired: true,
    },
  });

  if (channels.length === 0) {
    throw new Error("No active channels found for the given IDs");
  }

  // Flash (1) / High (2) skip human jitter so they dispatch without delay.
  // Normal (5+) keep staggered 90–150s pacing per account.
  const skipJitter = priority <= 2;
  const accountDelayMs = new Map<string, number>();
  const createdJobIds: string[] = [];

  const now = new Date();

  // Process channels in a stable order; BullMQ + DB orderBy priority ASC
  // ensure urgent jobs still jump ahead of already-queued normal work.
  for (const channel of channels) {
    let delayMs = 0;

    if (!skipJitter) {
      const previousDelay = accountDelayMs.get(channel.accountId) ?? 0;
      // First job on an account fires immediately; subsequent accumulate jitter.
      delayMs = previousDelay === 0 ? 0 : previousDelay;
      const nextDelay =
        previousDelay === 0 ? humanJitterMs() : previousDelay + humanJitterMs();
      accountDelayMs.set(channel.accountId, nextDelay);
    }

    const scheduledFor = new Date(now.getTime() + delayMs);
    const initialStatus = channel.isApprovalRequired
      ? "PENDING_APPROVAL"
      : "PENDING";

    const publishJob = await prisma.publishJob.create({
      data: {
        campaignId,
        channelId: channel.id,
        accountId: channel.accountId,
        scheduledFor,
        status: initialStatus,
        priority,
      },
    });

    createdJobIds.push(publishJob.id);

    // Only enqueue immediately-runnable jobs; approval-gated ones wait
    if (initialStatus === "PENDING") {
      const jobOptions: JobsOptions = {
        jobId: publishJob.id,
        priority, // BullMQ: lower number = higher priority
        delay: delayMs,
      };

      await getPublishQueue().add(
        "publish",
        {
          publishJobId: publishJob.id,
          campaignId,
          channelId: channel.id,
          accountId: channel.accountId,
          priority,
        },
        jobOptions
      );
    }
  }

  // Transition campaign out of DRAFT once jobs are scheduled
  if (campaign.status === "DRAFT" || campaign.status === "PAUSED") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "SCHEDULED" },
    });
  }

  return { jobIds: createdJobIds, queued: createdJobIds.length };
}

/**
 * Promote every PENDING / PENDING_APPROVAL job for a campaign to
 * priority 1 (urgent flash) and re-queue them so they jump ahead
 * of lower-priority items already sitting in BullMQ.
 */
export async function promoteToUrgent(campaignId: string): Promise<{
  promoted: number;
}> {
  const jobs = await prisma.publishJob.findMany({
    where: {
      campaignId,
      status: { in: ["PENDING", "PENDING_APPROVAL"] },
    },
    select: {
      id: true,
      channelId: true,
      accountId: true,
      status: true,
    },
  });

  if (jobs.length === 0) {
    return { promoted: 0 };
  }

  // Persist priority bump
  await prisma.publishJob.updateMany({
    where: {
      id: { in: jobs.map((j) => j.id) },
    },
    data: { priority: 1 },
  });

  // Re-enqueue PENDING jobs at priority 1 (remove old delayed jobs first)
  let promoted = 0;
  for (const job of jobs) {
    if (job.status !== "PENDING") continue;

    // Remove any existing delayed/waiting job with the same ID
    const existing = await getPublishQueue().getJob(job.id);
    if (existing) {
      const state = await existing.getState();
      if (state === "delayed" || state === "waiting" || state === "prioritized") {
        await existing.remove();
      }
    }

    await getPublishQueue().add(
      "publish",
      {
        publishJobId: job.id,
        campaignId,
        channelId: job.channelId,
        accountId: job.accountId,
        priority: 1,
      },
      {
        jobId: job.id,
        priority: 1,
        delay: 0, // fire ASAP
      }
    );
    promoted++;
  }

  return { promoted };
}

/**
 * Recommended BullMQ Worker options for the publish queue.
 * Import this in `worker/publish-worker.ts`.
 *
 * Strict sequential execution per accountId is achieved by:
 * - Running one worker process with concurrency = 1 globally, OR
 * - Using accountId as a group key with a group-aware worker
 *   (BullMQ Pro / custom lock). The baseline here uses concurrency 1
 *   plus the jitter delays above to guarantee sequential pacing.
 */
export function getPublishWorkerOptions() {
  return {
    connection: getRedisConnection(),
    concurrency: 1, // global sequential baseline
    limiter: {
      max: 1,
      duration: 1_000, // at most 1 job claimed per second (extra safety)
    },
  } as const;
}

/**
 * Pending jobs ready for dispatch, ordered so flash/urgent run first:
 * `priority ASC, scheduledFor ASC`.
 */
export async function listPendingJobsForDispatch(accountId?: string) {
  return prisma.publishJob.findMany({
    where: {
      status: "PENDING",
      ...(accountId ? { accountId } : {}),
    },
    orderBy: [{ priority: "asc" }, { scheduledFor: "asc" }],
    select: {
      id: true,
      campaignId: true,
      channelId: true,
      accountId: true,
      priority: true,
      scheduledFor: true,
      status: true,
    },
  });
}
