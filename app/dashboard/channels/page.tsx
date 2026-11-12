import { redirect } from "next/navigation";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { getAuthenticatedUserId } from "@/lib/auth";
import { PageHeader } from "@/components/dashboard/page-header";
import { ChannelsClient } from "./channels-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    redirect("/signin");
  }

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];

  try {
    accountId = await getActiveAccountId(userId);
    channels = accountId ? await listChannelsForAccount(accountId) : [];
  } catch (error) {
    console.error("[dashboard/channels] bootstrap", error);
  }

  const safeChannels = Array.isArray(channels) ? channels : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titleKey="navGroups"
        subtitleHe="סנכרנו ונהלו את קבוצות היעד להפצה"
        subtitleEn="Sync and manage your target groups for distribution"
      />

      {userId && !accountId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          החשבון מחובר, אך עדיין אין פרופיל פייסבוק שמור. התחברו מחדש עם פייסבוק.
        </div>
      )}

      {accountId && safeChannels.length === 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          אין קבוצות עדיין. Meta מגבילה גישה לקבוצות ב-Graph API לחלק מהאפליקציות —
          אפשר להוסיף קבוצות ידנית או לבקש הרשאות Groups ב-App Review.
        </div>
      )}

      <ChannelsClient accountId={accountId} initialChannels={safeChannels} />
    </div>
  );
}
