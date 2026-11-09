import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight session helper for API routes.
 * Expects a `distro_user_id` cookie set by the auth layer.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const userId =
    cookieStore.get("distro_user_id")?.value ||
    cookieStore.get("listpilot_user_id")?.value;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function requireAuth(): Promise<string> {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    throw new AuthError("Unauthorized");
  }
  return userId;
}

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}
