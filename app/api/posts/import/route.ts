import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";

const bodySchema = z.object({
  url: z.string().url(),
});

function isFacebookUrl(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host === "facebook.com" ||
      host === "m.facebook.com" ||
      host === "fb.com" ||
      host === "fb.watch" ||
      host.endsWith(".facebook.com")
    );
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function extractMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const match = html.match(re);
      if (match?.[1]) return decodeHtmlEntities(match[1].trim());
    }
  }
  return null;
}

async function fetchImageAsDataUrl(
  imageUrl: string
): Promise<{ dataUrl: string; contentType: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim();
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 8 * 1024 * 1024) return null;
    return {
      contentType,
      dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
    };
  } catch {
    return null;
  }
}

/**
 * POST /api/posts/import
 * Best-effort import of a public Facebook post via Open Graph tags.
 * Private posts often fail — use the extension "הפץ עם DISTRO" button instead.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "נא להדביק קישור תקין" },
        { status: 400 }
      );
    }

    const { url } = parsed.data;
    if (!isFacebookUrl(url)) {
      return NextResponse.json(
        { success: false, error: "הקישור חייב להיות קישור לפייסבוק" },
        { status: 400 }
      );
    }

    const pageRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    if (!pageRes.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "לא ניתן לטעון את הפוסט. נסו קישור ציבורי או השתמשו בתוסף Distro בפייסבוק.",
        },
        { status: 422 }
      );
    }

    const html = await pageRes.text();
    const text =
      extractMeta(html, ["og:description", "twitter:description", "description"]) ||
      "";
    const imageUrl =
      extractMeta(html, ["og:image", "twitter:image", "og:image:url"]) || null;

    if (!text && !imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error:
            "לא נמצא תוכן לייבוא (פוסט פרטי?). פתחו את הפוסט בפייסבוק ולחצו \"הפץ עם DISTRO\".",
        },
        { status: 422 }
      );
    }

    let imageDataUrl: string | null = null;
    let imageContentType: string | null = null;
    if (imageUrl) {
      const downloaded = await fetchImageAsDataUrl(imageUrl);
      if (downloaded) {
        imageDataUrl = downloaded.dataUrl;
        imageContentType = downloaded.contentType;
      }
    }

    return NextResponse.json({
      success: true,
      text,
      imageUrl,
      imageDataUrl,
      imageContentType,
      sourceUrl: url,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[posts/import]", error);
    return NextResponse.json(
      { success: false, error: "ייבוא הפוסט נכשל" },
      { status: 500 }
    );
  }
}
