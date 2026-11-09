import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CampaignsDashboard } from "@/components/dashboard/campaigns-dashboard";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { listFacebookAccounts } from "@/lib/facebook-accounts";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const userId = await getAuthenticatedUserId();
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (!userId && !allowDevLogin) {
    redirect("/signin");
  }

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];
  let userName = "משתמש";
  let avatarUrl = "";

  if (userId) {
    accountId = await getActiveAccountId(userId);
    if (accountId) {
      channels = await listChannelsForAccount(accountId);
    }
    const accounts = await listFacebookAccounts(userId);
    const active =
      accounts.find((a) => a.id === accountId) ||
      accounts.find((a) => a.isActive) ||
      accounts[0] ||
      null;
    if (active) {
      userName = active.name || "משתמש";
      avatarUrl = active.avatarUrl || "";
    }
  }

  const needsLogin = !userId || !accountId;

  return (
    <div className="space-y-4">
      {needsLogin && allowDevLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}
      <Suspense
        fallback={
          <div className="py-20 text-center text-sm text-slate-500">
            טוען לוח קמפיינים…
          </div>
        }
      >
        <CampaignsDashboard
          accountId={accountId}
          channels={channels}
          userName={userName}
          avatarUrl={avatarUrl}
        />
      </Suspense>
    </div>
  );
}
