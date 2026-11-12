import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  listCatchupCampaignsForUser,
} from "@/lib/hybrid-scheduler";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

/**
 * GET — active campaigns whose next_run_at is overdue (within catch-up window).
 * Used by the extension on startup / wake for missed-post catch-up.
 */
export async function GET() {
  try {
    const userId = await requireAuth();
    const rows = await listCatchupCampaignsForUser(userId);
    return NextResponse.json({
      success: true,
      campaigns: (rows || []).map((r: ScheduledPostRow) =>
        toScheduledPostDTO(r)
      ),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[campaigns/pending]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
