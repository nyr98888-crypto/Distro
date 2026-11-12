import { NextRequest } from "next/server";
import { z } from "zod";
import { setSessionCookie } from "@/lib/auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import {
  describeAuthError,
  ensureAuthSchema,
} from "@/lib/ensure-auth-schema";
import { createHandoffToken } from "@/lib/extension-handoff";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  REVIEWER_EMAIL,
  ensureReviewerWorkspace,
} from "@/lib/reviewer-workspace";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * POST /api/auth/login
 * Email/password sign-in for dashboard access (incl. Chrome Web Store reviewers).
 */
export async function POST(request: NextRequest) {
  try {
    await ensureAuthSchema();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsJson(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return corsJson(
        { success: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const { password } = parsed.data;

    // Ensure reviewer workspace exists before credential check
    if (email === REVIEWER_EMAIL.toLowerCase()) {
      await ensureReviewerWorkspace();
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return corsJson(
        {
          success: false,
          error: user
            ? "This account uses Facebook Login — use Continue with Facebook"
            : "Invalid email or password",
        },
        { status: 401 }
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return corsJson(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const account = await prisma.connectedAccount.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { _count: { select: { channels: true } } },
    });

    const handoffToken = createHandoffToken(user.id);
    const res = corsJson({
      success: true,
      authenticated: true,
      channelCount: account?._count.channels ?? 0,
      redirectTo: "/dashboard/channels",
      extensionToken: handoffToken,
      handoffPath: `/api/auth/extension-handoff?token=${encodeURIComponent(handoffToken)}`,
    });
    setSessionCookie(res, user.id);
    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return corsJson(
      { success: false, error: describeAuthError(error) },
      { status: 500 }
    );
  }
}
