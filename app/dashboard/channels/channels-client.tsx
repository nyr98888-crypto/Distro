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
  pingExtensionAsync,
  requestExtensionScrapeGroups,
} from "@/lib/extension-bridge";
import { useI18n } from "@/lib/i18n";
import { CHROME_STORE_URL } from "@/lib/support";

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
  const [awaitingInstall, setAwaitingInstall] = React.useState(false);
  const awaitingInstallRef = React.useRef(false);
  const syncInFlightRef = React.useRef(false);
  const runGroupSyncRef = React.useRef<() => Promise<void>>(async () => {});

  const stats = React.useMemo(
    () => computeChannelStats(channels),
    [channels]
  );

  const runGroupSync = React.useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncMessage(null);
    try {
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
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }, [dir]);

  runGroupSyncRef.current = runGroupSync;

  const beginAutoSyncAfterInstall = React.useCallback(() => {
    if (!awaitingInstallRef.current || syncInFlightRef.current) return;
    awaitingInstallRef.current = false;
    setAwaitingInstall(false);
    setExtensionReady(true);
    setSyncMessage(
      dir === "rtl"
        ? "התוסף זוהה — מתחילים סנכרון קבוצות…"
        : "Extension detected — starting group sync…"
    );
    void runGroupSyncRef.current();
  }, [dir]);

  React.useEffect(() => {
    const unsub = onExtensionReady(() => {
      setExtensionReady(true);
      beginAutoSyncAfterInstall();
    });
    pingExtension((ok) => {
      if (ok) setExtensionReady(true);
      else setExtensionReady((prev) => (prev === true ? true : false));
    });
    return unsub;
  }, [beginAutoSyncAfterInstall]);

  const handleSyncClick = React.useCallback(async () => {
    if (syncInFlightRef.current) return;

    const hasExt = await pingExtensionAsync();
    setExtensionReady(hasExt);

    if (!hasExt) {
      const storeUrl = CHROME_STORE_URL;
      if (storeUrl) {
        window.open(storeUrl, "_blank", "noopener,noreferrer");
      }
      awaitingInstallRef.current = true;
      setAwaitingInstall(true);
      setSyncMessage(
        dir === "rtl"
          ? "התקן את התוסף בחלון שנפתח ולאחר מכן חזור לכאן לסנכרון אוטומטי"
          : "Install the extension in the window that opened, then return here for automatic sync"
      );
      return;
    }

    awaitingInstallRef.current = false;
    setAwaitingInstall(false);
    await runGroupSync();
  }, [dir, runGroupSync]);

  React.useEffect(() => {
    const recheckAfterInstall = () => {
      if (!awaitingInstallRef.current || syncInFlightRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }

      pingExtension((ok) => {
        if (!ok) return;
        beginAutoSyncAfterInstall();
      });
    };

    const onFocus = () => recheckAfterInstall();
    const onVisibility = () => {
      if (document.visibilityState === "visible") recheckAfterInstall();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [beginAutoSyncAfterInstall]);

  const buttonLabel =
    extensionReady === false
      ? dir === "rtl"
        ? "התקן תוסף"
        : "Install Extension"
      : t("syncGroups");

  return (
    <div className="space-y-6">
      {extensionReady === false ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-medium text-sky-950">
            {dir === "rtl"
              ? "הורד והתקן את תוסף DISTRO לכרום"
              : "Download & install the DISTRO Chrome extension"}
          </p>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#4285F4] px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3367D6]"
          >
            {dir === "rtl" ? "הורדה מחנות Chrome" : "Get it on Chrome Web Store"}
          </a>
        </div>
      ) : extensionReady === true ? (
        <p
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          role="status"
        >
          {dir === "rtl" ? "התוסף מחובר" : "Extension Connected"}
        </p>
      ) : null}

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
          onClick={() => void handleSyncClick()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8] disabled:opacity-60"
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {buttonLabel}
        </button>
      </div>

      {syncMessage ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            awaitingInstall
              ? "border border-amber-200 bg-amber-50 text-amber-900"
              : "text-slate-600"
          }`}
          role="status"
        >
          {syncMessage}
        </p>
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
