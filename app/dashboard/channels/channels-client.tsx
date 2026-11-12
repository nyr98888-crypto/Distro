"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ChannelStatsCards } from "@/components/dashboard/channel-stats";
import { ChannelTable } from "@/components/dashboard/channel-table";
import {
  computeChannelStats,
  type ChannelDTO,
} from "@/lib/channels-shared";
import { notifyExtensionSyncGroups } from "@/lib/extension-bridge";
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

  async function reloadChannels() {
    try {
      const res = await fetch("/api/channels").catch(() => null);
      const text = res ? await res.text().catch(() => "") : "";
      let data: { channels?: ChannelDTO[] } | null = null;
      try {
        data = text ? (JSON.parse(text) as { channels?: ChannelDTO[] }) : null;
      } catch {
        data = null;
      }
      if (Array.isArray(data?.channels)) {
        setChannels(data.channels);
      }
    } catch {
      /* keep current */
    }
  }

  function syncGroups() {
    setSyncing(true);
    setSyncMessage(null);
    notifyExtensionSyncGroups((ok, err) => {
      if (!ok) {
        setSyncMessage(
          err ||
            (dir === "rtl"
              ? "הסנכרון נכשל — ודאו שהתוסף מותקן ופייסבוק פתוח"
              : "Sync failed — install the extension and open Facebook")
        );
        setSyncing(false);
        return;
      }
      setSyncMessage(
        dir === "rtl" ? "הסנכרון הושלם — מרענן קבוצות…" : "Sync done — refreshing…"
      );
      window.setTimeout(() => {
        void reloadChannels().finally(() => {
          setSyncing(false);
          setSyncMessage(
            dir === "rtl" ? "הקבוצות עודכנו" : "Groups updated"
          );
        });
      }, 1500);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {dir === "rtl"
            ? "סנכרנו קבוצות מהטאב הפעיל בפייסבוק דרך תוסף Chrome"
            : "Sync groups from your active Facebook tab via the Chrome extension"}
        </p>
        <button
          type="button"
          disabled={syncing}
          onClick={() => syncGroups()}
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
