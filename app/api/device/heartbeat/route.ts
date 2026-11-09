import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  isOnline: z.boolean().optional().default(true),
  extensionVersion: z.string().max(40).optional().default(""),
});

/** POST — Chrome extension heartbeat (every ~10 minutes). */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth();
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed" },
        { status: 400 }
      );
    }

    const session = await prisma.deviceSession.upsert({
      where: { userId },
      create: {
        userId,
        isOnline: parsed.data.isOnline,
        lastExtensionPing: new Date(),
        extensionVersion: parsed.data.extensionVersion || "",
      },
      update: {
        isOnline: parsed.data.isOnline,
        lastExtensionPing: new Date(),
        ...(parsed.data.extensionVersion
          ? { extensionVersion: parsed.data.extensionVersion }
          : {}),
      },
    });

    return NextResponse.json({
      success: true,
      session: {
        userId: session.userId,
        lastExtensionPing: session.lastExtensionPing.toISOString(),
        isOnline: session.isOnline,
        extensionVersion: session.extensionVersion,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    console.error("[device/heartbeat]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
