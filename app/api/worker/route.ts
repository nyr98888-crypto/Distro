import { NextRequest, NextResponse } from "next/server";
import puppeteer, { type CookieParam } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { turso, ensureTables } from "@/lib/turso";

export const maxDuration = 300;

function authorizeWorker(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-cron-secret") || "";
  const urlSecret = request.nextUrl.searchParams.get("secret") || "";
  const distroKey = request.headers.get("x-distro-key") || "";
  const apiKey = process.env.DISTRO_API_KEY || "";

  // Manual phone trigger sends no secret — allow for cloud-test UI.
  // When a secret *is* presented (Vercel Cron), it must match.
  const presented = Boolean(bearer || header || urlSecret || distroKey);
  if (!presented) return true;

  return (
    (!!secret && (bearer === secret || header === secret || urlSecret === secret)) ||
    (!!apiKey && distroKey === apiKey)
  );
}

function normalizeCookies(raw: unknown): CookieParam[] {
  if (!Array.isArray(raw)) {
    throw new Error("cookies_json must be a JSON array");
  }
  return raw.map((item: any) => {
    const c = item as Record<string, unknown>;
    const name = String(c.name ?? "");
    const value = String(c.value ?? "");
    if (!name) throw new Error("Cookie missing name");
    const cookie: CookieParam = {
      name,
      value,
      domain: c.domain != null ? String(c.domain) : ".facebook.com",
      path: c.path != null ? String(c.path) : "/",
    };
    if (typeof c.expirationDate === "number") {
      cookie.expires = c.expirationDate;
    } else if (typeof c.expires === "number") {
      cookie.expires = c.expires;
    }
    if (typeof c.httpOnly === "boolean") cookie.httpOnly = c.httpOnly;
    if (typeof c.secure === "boolean") cookie.secure = c.secure;
    if (c.sameSite != null) {
      const sameSite = String(c.sameSite).toLowerCase();
      if (sameSite === "strict") cookie.sameSite = "Strict";
      else if (sameSite === "lax") cookie.sameSite = "Lax";
      else if (sameSite === "none") cookie.sameSite = "None";
    }
    return cookie;
  });
}

/**
 * GET /api/worker — Vercel Cron (* * * * *) + manual "Run Worker Now"
 * Picks due cloud_campaigns, launches Chromium, posts with saved FB cookies.
 */
export async function GET(request: NextRequest) {
  if (!authorizeWorker(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureTables();

    const { rows: jobs } = await turso.execute({
      sql: `SELECT * FROM cloud_campaigns
            WHERE status = 'pending' AND scheduled_at <= ?
            ORDER BY scheduled_at ASC
            LIMIT 3`,
      args: [new Date().toISOString()],
    });

    if (jobs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No due jobs" });
    }

    const { rows: sessionRows } = await turso.execute(
      "SELECT cookies_json FROM fb_session WHERE id = 1"
    );
    if (!sessionRows.length) {
      return NextResponse.json(
        { error: "No Facebook cookies saved" },
        { status: 400 }
      );
    }

    const cookies = normalizeCookies(
      JSON.parse(String(sessionRows[0].cookies_json))
    );

    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const packUrl = `https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.${arch}.tar`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(packUrl),
      headless: true,
    });

    let processed = 0;

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setCookie(...cookies);

      for (const job of jobs) {
        const id = String(job.id);
        const groupUrl = String(job.group_url);
        const postText = String(job.post_text);

        await turso.execute({
          sql: "UPDATE cloud_campaigns SET status = 'running' WHERE id = ?",
          args: [id],
        });

        try {
          await page.goto(groupUrl, {
            waitUntil: "networkidle2",
            timeout: 45000,
          });

          await page.waitForSelector('[role="button"][tabindex="0"]', {
            timeout: 15000,
          });
          await page.evaluate(() => {
            const buttons = Array.from(
              document.querySelectorAll('[role="button"]')
            );
            const writeBox = buttons.find((el) =>
              /write something|כתוב משהו/i.test(el.textContent || "")
            ) as HTMLElement | undefined;
            writeBox?.click();
          });

          await page.waitForSelector(
            '[role="dialog"] [contenteditable="true"]',
            { timeout: 15000 }
          );
          await page.type(
            '[role="dialog"] [contenteditable="true"]',
            postText,
            { delay: 25 }
          );

          await page.evaluate(() => {
            const dialogButtons = Array.from(
              document.querySelectorAll('[role="dialog"] [role="button"]')
            );
            const postBtn = dialogButtons.find((el) =>
              /^(post|פרסם)$/i.test((el.textContent || "").trim())
            ) as HTMLElement | undefined;
            postBtn?.click();
          });

          await new Promise((r) => setTimeout(r, 5000));

          await turso.execute({
            sql: "UPDATE cloud_campaigns SET status = 'completed', error_log = NULL WHERE id = ?",
            args: [id],
          });
          processed++;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Unknown error";
          await turso.execute({
            sql: "UPDATE cloud_campaigns SET status = 'failed', error_log = ? WHERE id = ?",
            args: [message, id],
          });
        }
      }
    } finally {
      await browser.close();
    }

    return NextResponse.json({ processed });
  } catch (error) {
    console.error("[worker]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
