import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  toGroupPresetDTO,
  type GroupPresetRow,
} from "@/lib/group-presets";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  groupIds: z.array(z.string().min(1)).min(1).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
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

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const existing = await db.groupPreset.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }

    const preset = await db.groupPreset.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined
          ? { name: parsed.data.name.trim() }
          : {}),
        ...(parsed.data.groupIds
          ? { groupIds: JSON.stringify(parsed.data.groupIds) }
          : {}),
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
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const userId = await requireAuth();
    const { id } = await ctx.params;
    const existing = await db.groupPreset.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 }
      );
    }
    await db.groupPreset.delete({ where: { id } });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
