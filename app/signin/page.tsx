import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/signin/signin-screen";
import { getAuthenticatedUserId } from "@/lib/auth";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  try {
    await ensureAuthSchema();
    const userId = await getAuthenticatedUserId();
    if (userId) {
      const account = await prisma.connectedAccount.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { _count: { select: { channels: true } } },
      });
      if ((account?._count.channels ?? 0) > 0) {
        redirect("/dashboard/channels");
      }
    }
  } catch (error) {
    // next/navigation redirect() throws; never swallow it.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // Schema/env issues should not blank the login page — show the form instead.
    console.error("[signin/page]", error);
  }

  return <SignInScreen allowDevLogin={allowDevLogin} />;
}
