import { redirect } from "next/navigation";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-lg space-y-8 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1 text-center" dir="ltr">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Distro</h1>
          <p className="text-sm text-muted-foreground">
            Use your Distro account, or sync groups with the Chrome extension.
          </p>
        </div>

        <section className="space-y-3" dir="ltr">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Email &amp; password
          </h2>
          <PasswordLoginForm />
        </section>

        <div className="relative" dir="ltr">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <div dir="rtl" lang="he">
          <ExtensionConnectPanel allowDevLogin={allowDevLogin} />
        </div>
      </div>
    </div>
  );
}
