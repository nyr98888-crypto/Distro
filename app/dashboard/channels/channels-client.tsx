"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ChannelStatsCards } from "@/components/dashboard/channel-stats";
import { ChannelTable } from "@/components/dashboard/channel-table";
import {
  computeChannelStats,
  type ChannelDTO,
} from "@/lib/channels-shared";
import {
  onExtensionReady,
  pingExtension,
  requestExtensionScrapeGroups,
} from "@/lib/extension-bridge";
import { useI18n } from "@/lib/i18n";

type ChannelsClientProps = {
  accountId: string | null;
  initialChannels: ChannelDTO[];
};

export function ChannelsClient({
  accountId,
  initialChannels,
}: ChannelsClientProps) {
  const { t, dir } = useI18n();
  const [channels, setChannels] = React.useState(
    Array.isArray(initialChannels) ? initialChannels : []
  );
  const [syncing, setSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [extensionReady, setExtensionReady] = React.useState<boolean | null>(
    null
  );

  const stats = React.useMemo(
    () => computeChannelStats(channels),
    [channels]
  );

  React.useEffect(() => {
    const unsub = onExtensionReady(() => setExtensionReady(true));
    // Proactive ping so the dashboard recognizes an already-loaded bridge
    pingExtension((ok) => {
      if (ok) setExtensionReady(true);
      else setExtensionReady((prev) => (prev === true ? true : false));
    });
    return unsub;
  }, []);

  async function syncGroups() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const hasExt = await new Promise<boolean>((resolve) => {
        pingExtension((ok) => resolve(ok));
      });
      setExtensionReady(hasExt);

      if (!hasExt) {
        setSyncMessage(
          dir === "rtl"
            ? "יש להתקין את תוסף DISTRO בכרום ולרענן את העמוד — סנכרון קבוצות דורש את התוסף"
            : "Install the DISTRO Chrome extension and refresh — group sync requires the extension"
        );
        // Still purge fakes server-side
        await fetch("/api/groups/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ groups: [], cleanupFakes: true }),
        }).catch(() => null);
        return;
      }

      setSyncMessage(
        dir === "rtl"
          ? "פותח את רשימת הקבוצות בפייסבוק…"
          : "Opening Facebook joined groups…"
      );

      const scraped = await new Promise<{
        ok: boolean;
        groups?: Array<{
          facebookGroupId: string;
          name: string;
          url?: string;
          memberCount?: number;
        }>;
        error?: string;
      }>((resolve) => {
        requestExtensionScrapeGroups((result) => resolve(result));
      });

      if (!scraped.ok) {
        setSyncMessage(
          scraped.error ||
            (dir === "rtl"
              ? "התוסף לא הצליח לקרוא קבוצות — ודאו שאתם מחוברים לפייסבוק"
              : "Extension could not scrape groups — stay logged into Facebook")
        );
        return;
      }

      const groups = scraped.groups || [];
      const res = await fetch("/api/groups/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groups, cleanupFakes: true }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        needsReauth?: boolean;
        channels?: ChannelDTO[];
        channelCount?: number;
        extensionRequired?: boolean;
        message?: string;
        removedFakes?: number;
        source?: string;
      } | null;

      if (!res.ok || !data?.success) {
        if (data?.needsReauth) {
          setSyncMessage(
            dir === "rtl"
              ? "יש להתחבר מחדש עם פייסבוק כדי לסנכרן קבוצות"
              : "Reconnect with Facebook to sync groups"
          );
          window.setTimeout(() => {
            window.location.href =
              "/api/auth/facebook?callbackUrl=%2Fdashboard%2Fchannels";
          }, 1200);
          return;
        }
        setSyncMessage(
          data?.error ||
            (dir === "rtl" ? "הסנכרון נכשל" : "Sync failed")
        );
        return;
      }

      if (Array.isArray(data.channels)) {
        setChannels(data.channels);
      }
      const count = data.channelCount ?? data.channels?.length ?? 0;

      if (data.extensionRequired || count === 0) {
        setSyncMessage(
          dir === "rtl"
            ? "לא נמצאו קבוצות אמיתיות. התחברו לפייסבוק באותו דפדפן שבו מותקן התוסף, ואז לחצו שוב על סנכרון קבוצות."
            : data.message ||
                "No real groups found. Log into Facebook in the same browser as the extension, then sync again."
        );
        return;
      }

      const cleaned =
        typeof data.removedFakes === "number" && data.removedFakes > 0
          ? dir === "rtl"
            ? ` (הוסרו ${data.removedFakes} קבוצות בדיקה)`
            : ` (removed ${data.removedFakes} test groups)`
          : "";
      setSyncMessage(
        dir === "rtl"
          ? `הסנכרון הושלם — ${count} קבוצות אמיתיות${cleaned}`
          : `Sync complete — ${count} real groups${cleaned}`
      );
    } catch (err) {
      setSyncMessage(
        err instanceof Error
          ? err.message
          : dir === "rtl"
            ? "שגיאת סנכרון"
            : "Sync error"
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {dir === "rtl"
            ? extensionReady
              ? "סנכרון דרך תוסף DISTRO — קורא את הקבוצות מפייסבוק עם הסשן המחובר שלכם."
              : "נדרש תוסף DISTRO בכרום כדי לסנכרן קבוצות אמיתיות (בלי קבוצות בדיקה)."
            : extensionReady
              ? "Sync via the DISTRO extension — scrapes your joined Facebook groups with your browser session."
              : "The DISTRO Chrome extension is required to sync real groups (no test groups)."}
        </p>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncGroups()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t("syncGroups")}
        </button>
      </div>

      {syncMessage ? (
        <p className="text-sm text-slate-600">{syncMessage}</p>
      ) : null}
      <ChannelStatsCards stats={stats} />
      <ChannelTable
        accountId={accountId}
        channels={channels}
        onChannelsChange={setChannels}
      />
    </div>
  );
}
