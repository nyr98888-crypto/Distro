import { redirect } from "next/navigation";
import { ExtensionConnectPanel } from "@/components/signin/extension-connect-panel";
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

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-border bg-card p-6 text-right shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">התחברות</h1>
          <p className="text-sm text-muted-foreground">
            יש להתחבר כדי לנהל קבוצות ולתזמן פוסטים ב־דסטרו.
          </p>
        </div>

        <ExtensionConnectPanel allowDevLogin={allowDevLogin} />
      </div>
    </div>
  );
}
