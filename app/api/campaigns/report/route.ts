import { NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { applyCorsHeaders, corsJson, corsPreflight } from "@/lib/cors";
import { completeCampaignRun } from "@/lib/hybrid-scheduler";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { db } from "@/lib/db";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";
import { touchDeviceWorker } from "@/lib/remote-worker";

const resultSchema = z.object({
  groupId: z.string().optional().default(""),
  groupName: z.string().optional().default(""),
  groupExternalId: z.string().optional().default(""),
  postUrl: z.string().optional().default(""),
  postFbId: z.string().optional().default(""),
  status: z
    .enum(["live", "published", "failed", "deleted", "updated"])
    .optional()
    .default("live"),
});

const bodySchema = z.object({
  campaignId: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  /** PUBLISHED | FAILED | RUNNING (also accepts completed/failed/running) */
  status: z.enum([
    "PUBLISHED",
    "FAILED",
    "RUNNING",
    "completed",
    "failed",
    "running",
    "pending",
  ]),
  errorMessage: z.string().max(2000).optional(),
  results: z.array(resultSchema).optional(),
});

function normalizeStatus(
  status: z.infer<typeof bodySchema>["status"]
): "completed" | "failed" | "running" | "pending" {
  if (status === "PUBLISHED" || status === "completed") return "completed";
  if (status === "FAILED" || status === "failed") return "failed";
  if (status === "RUNNING" || status === "running") return "running";
  return "pending";
}

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/campaigns/report
 *
 * Extension reports per-campaign publish outcome after chrome.alarms polling.
 * PUBLISHED → completeCampaignRun (dashboard shows הושלם).
 * FAILED → mark failed. RUNNING → mark running.
 * Optional results[] upsert PublishedGroupPost rows.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAuthSchema();
    const userId = await requireAuth();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsJson(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return corsJson(
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
      return corsJson(
        { success: false, error: "campaignId is required" },
        { status: 400 }
      );
    }

    const existing = await db.scheduledPost.findFirst({
      where: { id: campaignId, userId },
    });
    if (!existing) {
      return corsJson(
        { success: false, error: "Campaign not found" },
        { status: 404 }
      );
    }

    try {
      await touchDeviceWorker({
        userId,
        accountId: existing.accountId,
        isOnline: true,
      });
    } catch {
      /* optional */
    }

    if (parsed.data.results?.length) {
      for (const g of parsed.data.results) {
        const postUrl = (g.postUrl || "").trim();
        if (!postUrl) continue;
        const liveStatus =
          g.status === "published" || g.status === "live"
            ? "live"
            : g.status === "failed"
              ? "live"
              : g.status;

        const match = await db.publishedGroupPost.findFirst({
          where: {
            scheduledPostId: campaignId,
            OR: [
              ...(g.postFbId ? [{ postFbId: g.postFbId }] : []),
              { postUrl },
              ...(g.groupExternalId
                ? [{ groupExternalId: g.groupExternalId, status: "live" }]
                : []),
            ],
          },
        });

        if (match) {
          await db.publishedGroupPost.update({
            where: { id: match.id },
            data: {
              groupId: g.groupId || match.groupId,
              groupName: g.groupName || match.groupName,
              groupExternalId: g.groupExternalId || match.groupExternalId,
              postUrl,
              postFbId: g.postFbId || match.postFbId,
              status: liveStatus,
            },
          });
        } else {
          await db.publishedGroupPost.create({
            data: {
              scheduledPostId: campaignId,
              groupId: g.groupId || "",
              groupName: g.groupName || "",
              groupExternalId: g.groupExternalId || "",
              postUrl,
              postFbId: g.postFbId || "",
              status: liveStatus,
            },
          });
        }
      }
    }

    const internal = normalizeStatus(parsed.data.status);

    if (internal === "completed") {
      const completed = await completeCampaignRun(campaignId, userId);
      const res = corsJson({
        success: true,
        status: completed?.status || "completed",
        post: completed,
      });
      return applyCorsHeaders(res);
    }

    const updated = await db.scheduledPost.update({
      where: { id: campaignId },
      data: {
        status: internal,
        ...(parsed.data.errorMessage
          ? { errorMessage: parsed.data.errorMessage }
          : {}),
        ...(internal === "failed"
          ? {}
          : internal === "running"
            ? { isActive: true }
            : {}),
      },
      include: { publishedPosts: true },
    });

    const res = corsJson({
      success: true,
      status: internal,
      post: toScheduledPostDTO(updated as ScheduledPostRow),
    });
    return applyCorsHeaders(res);
  } catch (error) {
    if (error instanceof AuthError) {
      return corsJson(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/report]", error);
    return corsJson(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
