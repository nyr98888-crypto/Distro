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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            החשבון מחובר, אך עדיין אין פרופיל פייסבוק שמור. התחברו מחדש עם
            פייסבוק.
          </span>
          <a
            href="/api/auth/facebook?callbackUrl=%2Fdashboard%2Fchannels"
            className="inline-flex items-center rounded-lg bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#166FE5]"
          >
            התחבר עם פייסבוק
          </a>
        </div>
      )}

      {accountId && safeChannels.length === 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          אין קבוצות עדיין. לחצו על &quot;סנכרן קבוצות&quot; כדי למשוך קבוצות/עמודים
          ישירות מפייסבוק דרך השרת (ללא תוסף). אם Meta מגבילה Groups ללא App Review,
          ייתכן שיופיעו רק עמודים שאתם מנהלים.
        </div>
      )}

      <ChannelsClient accountId={accountId} initialChannels={safeChannels} />
    </div>
  );
}
