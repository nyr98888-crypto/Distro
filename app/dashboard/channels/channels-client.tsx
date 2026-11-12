"use client";

import * as React from "react";
import { Loader2, Plus, RefreshCw } from "lucide-react";
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
  const [adding, setAdding] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [testName, setTestName] = React.useState("");

  const stats = React.useMemo(
    () => computeChannelStats(channels),
    [channels]
  );

  async function syncGroups() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/groups/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ seedIfEmpty: true }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        needsReauth?: boolean;
        channels?: ChannelDTO[];
        channelCount?: number;
        seeded?: boolean;
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
      if (data.seeded) {
        setSyncMessage(
          dir === "rtl"
            ? `לא נמצאו עמודים ב-Graph — נטענו ${count} קבוצות בדיקה לבחירה בקמפיין`
            : `No Graph pages found — seeded ${count} test groups for campaign selection`
        );
      } else {
        setSyncMessage(
          dir === "rtl"
            ? `הסנכרון הושלם — ${count} יעדים`
            : `Sync complete — ${count} targets`
        );
      }
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

  async function addTestGroup() {
    const name = testName.trim();
    if (!name) return;
    setAdding(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/groups/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          seedIfEmpty: false,
          addTestGroup: { name, memberCount: 1000 },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        channels?: ChannelDTO[];
      } | null;
      if (!res.ok || !data?.success) {
        setSyncMessage(
          data?.error ||
            (dir === "rtl" ? "הוספה נכשלה" : "Add failed")
        );
        return;
      }
      if (Array.isArray(data.channels)) setChannels(data.channels);
      setTestName("");
      setSyncMessage(
        dir === "rtl"
          ? `נוספה קבוצת בדיקה: ${name}`
          : `Added test group: ${name}`
      );
    } catch (err) {
      setSyncMessage(
        err instanceof Error
          ? err.message
          : dir === "rtl"
            ? "שגיאה"
            : "Error"
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {dir === "rtl"
            ? "סנכרון מפייסבוק דרך השרת (Graph API) — בלי תוסף. אם אין עמודים, נטענות קבוצות בדיקה."
            : "Server-side Facebook Graph sync — no extension. Seeds test groups when pages are empty."}
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

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm text-slate-600">
          <span>
            {dir === "rtl"
              ? "+ הוסף קבוצה לבדיקה"
              : "+ Add test group"}
          </span>
          <input
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            placeholder={
              dir === "rtl"
                ? "שם קבוצת בדיקה…"
                : "Test group name…"
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-slate-900 outline-none focus:border-[#2563EB]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTestGroup();
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={adding || !testName.trim()}
          onClick={() => void addTestGroup()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {dir === "rtl" ? "הוסף" : "Add"}
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
