import { NextRequest, NextResponse } from "next/server";
import {
  dispatchCloudFallback,
  listDueCampaigns,
  resolveExecutionMode,
} from "@/lib/hybrid-scheduler";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Dev-friendly: allow when secret unset (local only)
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-cron-secret") || "";
  const urlSecret = request.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || header === secret || urlSecret === secret;
}

/**
 * GET/POST — every ~5 minutes.
 * If the user's extension has not pinged in >20 minutes (or executionMode=cloud),
 * dispatch due campaigns to the cloud headless worker.
 */
export async function GET(request: NextRequest) {
  return runCron(request);
}

export async function POST(request: NextRequest) {
  return runCron(request);
}

async function runCron(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const due = await listDueCampaigns(new Date());
    const results: Array<{
      id: string;
      mode: string;
      action: string;
    }> = [];

    for (const campaign of due) {
      const lastPing = campaign.user.deviceSession?.lastExtensionPing;
      const mode = resolveExecutionMode(campaign.executionMode, lastPing);

      if (mode === "extension") {
        // Extension is online — leave for chrome.alarms / catch-up
        results.push({
          id: campaign.id,
          mode,
          action: "defer_to_extension",
        });
        continue;
      }

      const dispatched = await dispatchCloudFallback(campaign);
      results.push({
        id: campaign.id,
        mode,
        action: dispatched.dispatched ? "cloud_dispatched" : "cloud_queued",
      });
    }

    return NextResponse.json({
      success: true,
      checked: due.length,
      results,
    });
  } catch (error) {
    console.error("[cron/check-schedules]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Cron failed",
      },
      { status: 500 }
    );
  }
}
