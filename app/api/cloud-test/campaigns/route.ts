import { NextResponse } from "next/server";
import { turso, ensureTables } from "@/lib/turso";

/**
 * GET /api/cloud-test/campaigns
 * List recent cloud-test jobs (newest first).
 */
export async function GET() {
  try {
    await ensureTables();
    const { rows } = await turso.execute(
      "SELECT * FROM cloud_campaigns ORDER BY created_at DESC LIMIT 30"
    );
    return NextResponse.json({ campaigns: rows });
  } catch (error) {
    console.error("[cloud-test/campaigns/GET]", error);
    return NextResponse.json(
      {
        campaigns: [],
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cloud-test/campaigns
 * - action=save_cookies → upsert Facebook Cookie-Editor JSON
 * - otherwise → queue a group post from phone
 */
export async function POST(req: Request) {
  try {
    await ensureTables();
    const body = await req.json();

    if (body.action === "save_cookies") {
      if (typeof body.cookiesJson !== "string" || !body.cookiesJson.trim()) {
        return NextResponse.json(
          { ok: false, error: "cookiesJson required" },
          { status: 400 }
        );
      }
      // Validate JSON early so bad paste fails here, not in the worker
      JSON.parse(body.cookiesJson);

      await turso.execute({
        sql: `INSERT INTO fb_session (id, cookies_json, updated_at)
              VALUES (1, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(id) DO UPDATE SET
                cookies_json = excluded.cookies_json,
                updated_at = CURRENT_TIMESTAMP`,
        args: [body.cookiesJson],
      });
      return NextResponse.json({ ok: true });
    }

    if (
      typeof body.groupUrl !== "string" ||
      !body.groupUrl.trim() ||
      typeof body.postText !== "string" ||
      !body.postText.trim()
    ) {
      return NextResponse.json(
        { ok: false, error: "groupUrl and postText required" },
        { status: 400 }
      );
    }

    const id = crypto.randomUUID();
    const scheduledAt =
      typeof body.scheduledAt === "string" && body.scheduledAt
        ? body.scheduledAt
        : new Date().toISOString();

    await turso.execute({
      sql: `INSERT INTO cloud_campaigns (id, group_url, post_text, scheduled_at, status)
            VALUES (?, ?, ?, ?, 'pending')`,
      args: [id, body.groupUrl.trim(), body.postText.trim(), scheduledAt],
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("[cloud-test/campaigns/POST]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
