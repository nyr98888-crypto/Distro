import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CampaignsDashboard } from "@/components/dashboard/campaigns-dashboard";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { listFacebookAccounts } from "@/lib/facebook-accounts";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/signin");
  }

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];
  let userName = "משתמש";
  let avatarUrl = "";

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (user?.name?.trim()) {
      userName = user.name.trim();
    } else if (user?.email?.includes("@") && !user.email.startsWith("fb_")) {
      userName = user.email.split("@")[0] || userName;
    }

    accountId = await getActiveAccountId(userId);
    channels = accountId ? await listChannelsForAccount(accountId) : [];
    const accounts = (await listFacebookAccounts(userId)) || [];
    const active =
      accounts.find((a) => a.id === accountId) ||
      accounts.find((a) => a.isActive) ||
      accounts[0] ||
      null;
    if (active) {
      userName = active.name || userName;
      avatarUrl = active.avatarUrl || "";
    }
  } catch (error) {
    console.error("[dashboard/campaigns] bootstrap", error);
  }

  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="py-20 text-center text-sm text-slate-500">
            טוען…
          </div>
        }
      >
        <CampaignsDashboard
          userName={userName}
          avatarUrl={avatarUrl}
          accountId={accountId}
          channels={channels}
        />
      </Suspense>
    </div>
  );
}
