import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * POST /api/upload
 * Multipart form field `file` → public Vercel Blob URL for campaign photos.
 * Falls back to a data-URL echo when BLOB_READ_WRITE_TOKEN is not configured (local/dev).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Missing file field" },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be between 1 byte and 8 MB" },
        { status: 400 }
      );
    }

    const type = file.type || "application/octet-stream";
    if (!ALLOWED.has(type)) {
      return NextResponse.json(
        { success: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed" },
        { status: 400 }
      );
    }

    const safeName = (file.name || "photo.jpg")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80);
    const pathname = `campaigns/${Date.now()}-${safeName}`;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Local/dev fallback so mobile wizards still work without Blob credentials.
      const buffer = Buffer.from(await file.arrayBuffer());
      const dataUrl = `data:${type};base64,${buffer.toString("base64")}`;
      return NextResponse.json({
        success: true,
        url: dataUrl,
        pathname,
        fallback: true,
      });
    }

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: type,
    });

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: file.size,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[upload]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
