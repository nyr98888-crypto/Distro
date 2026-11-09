import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/signin/signin-screen";
import { getAuthenticatedUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

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

  return <SignInScreen allowDevLogin={allowDevLogin} />;
}
