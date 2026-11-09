import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  toScheduledPostDTO,
  type ScheduledPostRow,
} from "@/lib/scheduled-posts";

const resultSchema = z.object({
  groupId: z.string().optional().default(""),
  groupName: z.string().optional().default(""),
  groupExternalId: z.string().optional().default(""),
  postUrl: z.string().url(),
  postFbId: z.string().optional().default(""),
  status: z.enum(["live", "deleted", "updated"]).optional().default("live"),
});

const bodySchema = z.object({
  results: z.array(resultSchema).min(1),
  replace: z.boolean().optional().default(false),
});

type Ctx = { params: Promise<{ id: string }> };

/** POST — upsert published Facebook post URLs after a broadcast / repost. */
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

    const existing = await prisma.scheduledPost.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    if (parsed.data.replace) {
      await prisma.publishedGroupPost.deleteMany({
        where: { scheduledPostId: id },
      });
    }

    for (const result of parsed.data.results) {
      const match = await prisma.publishedGroupPost.findFirst({
        where: {
          scheduledPostId: id,
          OR: [
            ...(result.postFbId
              ? [{ postFbId: result.postFbId }]
              : []),
            { postUrl: result.postUrl },
            ...(result.groupExternalId
              ? [
                  {
                    groupExternalId: result.groupExternalId,
                    status: "live",
                  },
                ]
              : []),
          ],
        },
      });

      if (match) {
        await prisma.publishedGroupPost.update({
          where: { id: match.id },
          data: {
            groupId: result.groupId || match.groupId,
            groupName: result.groupName || match.groupName,
            groupExternalId:
              result.groupExternalId || match.groupExternalId,
            postUrl: result.postUrl,
            postFbId: result.postFbId || match.postFbId,
            status: result.status,
          },
        });
      } else {
        await prisma.publishedGroupPost.create({
          data: {
            scheduledPostId: id,
            groupId: result.groupId,
            groupName: result.groupName,
            groupExternalId: result.groupExternalId,
            postUrl: result.postUrl,
            postFbId: result.postFbId,
            status: result.status,
          },
        });
      }
    }

    const post = await prisma.scheduledPost.findFirst({
      where: { id },
      include: { publishedPosts: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json({
      success: true,
      post: toScheduledPostDTO(post as ScheduledPostRow),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[scheduled-posts/published]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
