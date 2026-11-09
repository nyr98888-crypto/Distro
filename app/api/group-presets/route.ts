import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/channels";
import { prisma } from "@/lib/prisma";
import {
  toGroupPresetDTO,
  type GroupPresetRow,
} from "@/lib/group-presets";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  groupIds: z.array(z.string().min(1)).min(1),
});

export async function GET() {
  try {
    const userId = await requireAuth();
    const accountId = await getActiveAccountId(userId);
    const presets = await prisma.groupPreset.findMany({
      where: {
        userId,
        OR: accountId
          ? [{ accountId }, { accountId: null }]
          : [{ accountId: null }],
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      success: true,
      presets: presets.map((p) => toGroupPresetDTO(p as GroupPresetRow)),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[group-presets/GET]", error);
    return NextResponse.json(
      { success: true, presets: [] },
      { status: 200 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const accountId = await getActiveAccountId(userId);
    const preset = await prisma.groupPreset.create({
      data: {
        userId,
        accountId: accountId || null,
        name: parsed.data.name.trim(),
        groupIds: JSON.stringify(parsed.data.groupIds),
      },
    });

    return NextResponse.json({
      success: true,
      preset: toGroupPresetDTO(preset as GroupPresetRow),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[group-presets/POST]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
