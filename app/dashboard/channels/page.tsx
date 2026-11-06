import Image from "next/image";
import { redirect } from "next/navigation";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { getAuthenticatedUserId } from "@/lib/auth";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { ChannelsClient } from "./channels-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const userId = await getAuthenticatedUserId();
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (!userId && !allowDevLogin) {
    redirect("/signin");
  }

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];

  if (userId) {
    accountId = await getActiveAccountId(userId);
    if (accountId) {
      channels = await listChannelsForAccount(accountId);
    }
  }

  const needsLogin = !userId || !accountId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900 p-6 text-white shadow-sm md:flex-row">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="DISTRO Brand mark"
            width={72}
            height={72}
            className="rounded-xl border border-slate-700 object-contain shadow-md"
            priority
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              ערוצי יעד וקבוצות
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              נהל את ערוצי ההפצה וסנכרן את הקבוצות שלך לחשבון
            </p>
          </div>
        </div>

        <a
          href="/distro-extension.zip"
          download="distro-extension.zip"
          className="flex items-center gap-3 rounded-lg bg-gradient-to-b from-slate-100 to-slate-200 px-5 py-2.5 font-semibold text-slate-900 shadow transition-all hover:from-white hover:to-slate-100 hover:shadow-md"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          התקנת תוסף כרום לסנכרון
        </a>
      </div>

      {needsLogin && allowDevLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}

      {userId && !accountId && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          אין חשבון מחובר פעיל. התחברו כמשתמש בדיקה או סנכרנו סשן דרך{" "}
          <code className="rounded bg-muted px-1">/api/session/sync</code>.
        </div>
      )}

      <ChannelsClient accountId={accountId} initialChannels={channels} />
    </div>
  );
}
