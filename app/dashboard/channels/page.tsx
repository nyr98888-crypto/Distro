import { redirect } from "next/navigation";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { getAuthenticatedUserId } from "@/lib/auth";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { PageHeader } from "@/components/dashboard/page-header";
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
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titleKey="navGroups"
        subtitleHe="סנכרנו ונהלו את קבוצות היעד להפצה"
        subtitleEn="Sync and manage your target groups for distribution"
      />

      {needsLogin && allowDevLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}

      {userId && !accountId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          אין חשבון מחובר פעיל. התחברו או סנכרנו סשן דרך התוסף.
        </div>
      )}

      <ChannelsClient accountId={accountId} initialChannels={channels} />
    </div>
  );
}
