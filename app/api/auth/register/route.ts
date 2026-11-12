import { NextRequest } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { createHandoffToken } from "@/lib/extension-handoff";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/auth/register
 * Create a new email/password account and set the session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsJson(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return corsJson(
        {
          success: false,
          error: "Valid email and password (min 8 characters) are required",
        },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const { password } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return corsJson(
        { success: false, error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
      },
      select: { id: true },
    });

    const handoffToken = createHandoffToken(user.id);
    const res = corsJson({
      success: true,
      authenticated: true,
      channelCount: 0,
      redirectTo: "/dashboard/channels",
      extensionToken: handoffToken,
      handoffPath: `/api/auth/extension-handoff?token=${encodeURIComponent(handoffToken)}`,
    });
    setSessionCookie(res, user.id);
    return res;
  } catch (error) {
    console.error("[auth/register]", error);
    return corsJson(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
