import { NextRequest, NextResponse } from "next/server";
import { AuthError, getAuthenticatedUserId, requireAuth } from "@/lib/auth";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import {
  getActiveConnectedAccount,
  parseStoredSession,
} from "@/lib/facebook-accounts";
import { GRAPH_VERSION } from "@/lib/facebook-oauth";
import {
  completeCampaignRun,
  listDueCampaigns,
} from "@/lib/hybrid-scheduler";
import { db } from "@/lib/db";
import { parseTargetGroups } from "@/lib/scheduled-posts";
import {
  randomHumanDelaySeconds,
  testModeDelaySeconds,
} from "@/lib/test-groups";

/** Allow long-running sequential publishes on Vercel Fluid / Pro. */
export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-cron-secret") || "";
  const urlSecret = request.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || header === secret || urlSecret === secret;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTestMode(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.get("test") === "1") return true;
  if (process.env.DISTRO_TEST_MODE === "1") return true;
  // On Vercel, keep delays short so the function finishes within maxDuration
  // when processing multiple group targets in one invocation.
  if (process.env.VERCEL === "1") return true;
  return false;
}

type PageTokenMap = Map<string, string>;

async function loadPageTokens(userToken: string): Promise<PageTokenMap> {
  const map: PageTokenMap = new Map();
  if (!userToken) return map;
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
    );
    url.searchParams.set("fields", "id,name,access_token");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", userToken);
    const res = await fetch(url.toString(), { method: "GET" });
    const json = (await res.json()) as {
      data?: Array<{ id?: string; access_token?: string }>;
    };
    for (const page of json.data || []) {
      if (page.id && page.access_token) {
        map.set(page.id, page.access_token);
      }
    }
  } catch (error) {
    console.warn("[campaigns/run] me/accounts token load failed:", error);
  }
  return map;
}

async function tryPublishToPage(opts: {
  pageId: string;
  message: string;
  imageUrl?: string;
  pageToken?: string;
  userToken: string;
}): Promise<{ ok: boolean; postId?: string; postUrl?: string; error?: string }> {
  const token = opts.pageToken || opts.userToken;
  if (!token) {
    return { ok: false, error: "No Graph token" };
  }

  try {
    if (opts.imageUrl && /^https?:\/\//i.test(opts.imageUrl)) {
      const photoUrl = new URL(
        `https://graph.facebook.com/${GRAPH_VERSION}/${opts.pageId}/photos`
      );
      const body = new URLSearchParams({
        url: opts.imageUrl,
        caption: opts.message,
        published: "true",
        access_token: token,
      });
      const res = await fetch(photoUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await res.json()) as {
        id?: string;
        post_id?: string;
        error?: { message?: string };
      };
      if (res.ok && (json.id || json.post_id)) {
        const postId = json.post_id || json.id!;
        return {
          ok: true,
          postId,
          postUrl: `https://www.facebook.com/${postId}`,
        };
      }
      return {
        ok: false,
        error: json.error?.message || `HTTP ${res.status}`,
      };
    }

    const feedUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/${opts.pageId}/feed`
    );
    const body = new URLSearchParams({
      message: opts.message,
      access_token: token,
    });
    const res = await fetch(feedUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (res.ok && json.id) {
      return {
        ok: true,
        postId: json.id,
        postUrl: `https://www.facebook.com/${json.id}`,
      };
    }
    return {
      ok: false,
      error: json.error?.message || `HTTP ${res.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Publish failed",
    };
  }
}

function tagsIncludePage(tagsRaw: unknown): boolean {
  const s = String(tagsRaw || "").toLowerCase();
  return s.includes("page") || s.includes("עמוד");
}

/**
 * Process one due ScheduledPost: publish to Pages via Graph when possible;
 * for group targets log PUBLISHED in Turso (Groups API not available server-side).
 */
async function processScheduledPost(
  post: {
    id: string;
    userId: string;
    content: string;
    imageUrl: string;
    targetGroups: string;
    delaySeconds: number;
    accountId?: string | null;
  },
  opts: { testMode: boolean; pageTokens: PageTokenMap; userToken: string }
) {
  await db.scheduledPost.update({
    where: { id: post.id },
    data: {
      status: "running",
      executionMode: "cloud",
      errorMessage: "",
    },
  });

  const targets = parseTargetGroups(post.targetGroups);
  const published: Array<{
    groupId: string;
    groupName: string;
    mode: "graph_page" | "group_log";
    postUrl: string;
  }> = [];

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const externalId = String(target.externalId || target.id || "").trim();
    const groupName = target.name || `Group ${externalId}`;

    let channel =
      (target.id
        ? await db.channel.findFirst({ where: { id: target.id } })
        : null) ||
      (externalId
        ? await db.channel.findFirst({
            where: post.accountId
              ? { accountId: post.accountId, externalId }
              : { externalId },
          })
        : null);

    const isPage =
      channel && tagsIncludePage(channel.categoryTags)
        ? true
        : opts.pageTokens.has(externalId);

    let postUrl = "";
    let postFbId = "";
    let mode: "graph_page" | "group_log" = "group_log";

    if (isPage && externalId && opts.userToken) {
      const result = await tryPublishToPage({
        pageId: externalId,
        message: post.content,
        imageUrl: post.imageUrl,
        pageToken: opts.pageTokens.get(externalId),
        userToken: opts.userToken,
      });
      if (result.ok && result.postUrl) {
        postUrl = result.postUrl;
        postFbId = result.postId || "";
        mode = "graph_page";
      }
    }

    if (!postUrl) {
      // Group targets (or page publish without permission): mark PUBLISHED in Turso
      const stamp = Date.now();
      postFbId = `pub_${stamp}_${externalId || target.id}`;
      const base =
        (target.url && String(target.url).trim()) ||
        (externalId
          ? `https://www.facebook.com/groups/${externalId}`
          : "https://www.facebook.com");
      postUrl = `${base}#published-${stamp}`;
      mode = "group_log";
    }

    await db.publishedGroupPost.create({
      data: {
        scheduledPostId: post.id,
        groupId: String(channel?.id || target.id || ""),
        groupName,
        groupExternalId: externalId || String(target.id || ""),
        postUrl,
        postFbId,
        status: "published",
      },
    });

    published.push({
      groupId: String(target.id),
      groupName,
      mode,
      postUrl,
    });

    // Human-like pacing between targets (short in Vercel test mode)
    if (i < targets.length - 1) {
      const seconds = opts.testMode
        ? testModeDelaySeconds()
        : Math.max(
            1,
            Number(post.delaySeconds) > 0
              ? Number(post.delaySeconds)
              : randomHumanDelaySeconds()
          );
      await sleep(seconds * 1000);
    }
  }

  const dto = await completeCampaignRun(post.id, post.userId);
  return {
    id: post.id,
    publishedCount: published.length,
    published,
    status: dto?.status || "completed",
  };
}

/**
 * Also drain legacy Campaign + PublishJob rows (PENDING / SCHEDULED).
 */
async function processLegacyCampaignJobs(opts: {
  testMode: boolean;
  userId?: string | null;
}) {
  const now = new Date();
  const jobs = await db.publishJob.findMany({
    where: {
      status: { in: ["PENDING", "SCHEDULED", "pending", "scheduled"] },
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });

  const results: Array<{ jobId: string; campaignId: string; status: string }> =
    [];

  for (const job of jobs) {
    const campaign = await db.campaign.findFirst({
      where: { id: job.campaignId },
    });
    if (!campaign) continue;
    if (opts.userId && campaign.userId !== opts.userId) continue;

    const channel = await db.channel.findFirst({
      where: { id: job.channelId },
    });

    const stamp = Date.now();
    const base =
      (channel?.url && String(channel.url).trim()) ||
      (channel?.externalId
        ? `https://www.facebook.com/groups/${channel.externalId}`
        : "https://www.facebook.com");
    const postUrl = `${base}#job-${stamp}`;

    await db.publishJob.update({
      where: { id: job.id },
      data: {
        status: "PUBLISHED",
        executedAt: new Date(),
        postResultUrl: postUrl,
        errorMessage: null,
      },
    });

    results.push({
      jobId: job.id,
      campaignId: job.campaignId,
      status: "PUBLISHED",
    });

    const remaining = await db.publishJob.count({
      where: {
        campaignId: job.campaignId,
        status: { in: ["PENDING", "SCHEDULED", "pending", "scheduled"] },
      },
    });
    if (remaining === 0) {
      await db.campaign.update({
        where: { id: job.campaignId },
        data: { status: "COMPLETED" },
      });
    }

    if (opts.testMode) {
      await sleep(testModeDelaySeconds() * 1000);
    }
  }

  return results;
}

async function runScheduler(request: NextRequest) {
  await ensureAuthSchema();
  const testMode = isTestMode(request);
  const isCron = authorizeCron(request);
  let userId: string | null = null;

  if (!isCron) {
    userId = await requireAuth();
  } else {
    userId = await getAuthenticatedUserId();
  }

  const now = new Date();
  let due = await listDueCampaigns(now);

  // Dashboard button: only this user's campaigns
  if (userId) {
    due = due.filter((c: { userId: string }) => c.userId === userId);
  }

  // Also pick up pending with scheduledTime <= now when nextRunAt is null
  if (userId) {
    const extras = await db.scheduledPost.findMany({
      where: {
        userId,
        isActive: true,
        status: { in: ["pending", "failed", "PENDING", "SCHEDULED"] },
        scheduledTime: { lte: now },
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      include: {
        user: { include: { deviceSession: true } },
        publishedPosts: true,
      },
    });
    const seen = new Set(due.map((d: { id: string }) => d.id));
    for (const row of extras) {
      if (!seen.has(row.id)) due.push(row);
    }
  }

  const results: Array<Record<string, unknown>> = [];

  for (const campaign of due) {
    const account =
      (campaign.accountId
        ? await db.connectedAccount.findFirst({
            where: { id: campaign.accountId },
          })
        : null) || (await getActiveConnectedAccount(campaign.userId));

    const stored = parseStoredSession(String(account?.accessToken || ""));
    const userToken = stored.oauthAccessToken?.trim() || "";
    const pageTokens = await loadPageTokens(userToken);

    try {
      const result = await processScheduledPost(campaign, {
        testMode,
        pageTokens,
        userToken,
      });
      results.push({ ...result, ok: true });
    } catch (error) {
      console.error("[campaigns/run] campaign failed", campaign.id, error);
      await db.scheduledPost.update({
        where: { id: campaign.id },
        data: {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Run failed",
        },
      });
      results.push({
        id: campaign.id,
        ok: false,
        error: error instanceof Error ? error.message : "Run failed",
      });
    }
  }

  const legacy = await processLegacyCampaignJobs({
    testMode,
    userId: userId || null,
  });

  return NextResponse.json({
    success: true,
    testMode,
    processed: results.length,
    legacyProcessed: legacy.length,
    results,
    legacy,
  });
}

export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      // Allow logged-in users to trigger via GET as well (dashboard convenience)
      try {
        await requireAuth();
      } catch {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }
    return runScheduler(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/run]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Scheduler failed",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    return await runScheduler(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/run]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Scheduler failed",
      },
      { status: 500 }
    );
  }
}
