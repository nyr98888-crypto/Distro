"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ChannelStatsCards } from "@/components/dashboard/channel-stats";
import { ChannelTable } from "@/components/dashboard/channel-table";
import {
  computeChannelStats,
  type ChannelDTO,
} from "@/lib/channels-shared";
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

  const stats = React.useMemo(
    () => computeChannelStats(channels),
    [channels]
  );

  async function syncGroups() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/facebook/sync", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        needsReauth?: boolean;
        channels?: ChannelDTO[];
        channelCount?: number;
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
      setSyncMessage(
        dir === "rtl"
          ? `הסנכרון הושלם — ${data.channelCount ?? data.channels?.length ?? 0} יעדים`
          : `Sync complete — ${data.channelCount ?? data.channels?.length ?? 0} targets`
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
            ? "סנכרון ישיר מפייסבוק דרך השרת — ללא צורך בתוסף Chrome"
            : "Direct Facebook sync via the server — no Chrome extension required"}
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
