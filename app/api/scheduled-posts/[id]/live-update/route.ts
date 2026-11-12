import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

const bodySchema = z.object({
  mode: z.enum(["text", "replace_repost"]),
  content: z.string().min(1).optional(),
  imageUrl: z.string().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — prepare a live Facebook update job.
 * Persists content/image changes, then returns the payload the extension
 * needs to edit (text) or delete+repost (images) across published groups.
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;

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
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const existing = await db.scheduledPost.findFirst({
      where: { id, userId },
      include: {
        publishedPosts: {
          where: { status: { in: ["live", "updated"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    if (!existing.publishedPosts.length) {
      return NextResponse.json(
        {
          success: false,
          error: "אין פוסטים חיים שמורים לקמפיין זה — פרסמו קודם לקבוצות",
        },
        { status: 400 }
      );
    }

    const content = parsed.data.content ?? existing.content;
    const imageUrl =
      parsed.data.imageUrl !== undefined
        ? parsed.data.imageUrl
        : existing.imageUrl;

    if (parsed.data.mode === "replace_repost" && !imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error: "נדרשת תמונה חדשה עבור מחיקה ופרסום מחדש",
        },
        { status: 400 }
      );
    }

    const post = await db.scheduledPost.update({
      where: { id },
      data: {
        content,
        ...(parsed.data.imageUrl !== undefined
          ? { imageUrl: parsed.data.imageUrl }
          : {}),
      },
      include: {
        publishedPosts: {
          where: { status: { in: ["live", "updated"] } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const dto = toScheduledPostDTO(post as ScheduledPostRow);

    return NextResponse.json({
      success: true,
      post: dto,
      job: {
        mode: parsed.data.mode,
        content: dto.content,
        imageUrl: dto.imageUrl,
        delaySeconds: dto.delaySeconds,
        targets: dto.publishedPosts.map((p: any) => ({
          id: p.id,
          groupId: p.groupId,
          groupName: p.groupName,
          groupExternalId: p.groupExternalId,
          postUrl: p.postUrl,
          postFbId: p.postFbId,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[scheduled-posts/live-update]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
