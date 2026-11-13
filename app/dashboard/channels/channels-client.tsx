"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  ExtensionGuideButton,
  ExtensionInstallGuide,
} from "@/components/dashboard/extension-install-guide";
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
  const { t } = useI18n();
  const [channels, setChannels] = React.useState(
    Array.isArray(initialChannels) ? initialChannels : []
  );
  const [syncing, setSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [syncMessageTone, setSyncMessageTone] = React.useState<
    "neutral" | "amber" | "success"
  >("neutral");
  const [extensionReady, setExtensionReady] = React.useState<boolean | null>(
    null
  );
  /** Manual reopen of the 3-step guide (works even after install). */
  const [guideForcedOpen, setGuideForcedOpen] = React.useState(false);
  const [checkingInstall, setCheckingInstall] = React.useState(false);

  const awaitingInstallRef = React.useRef(false);
  const extensionReadyRef = React.useRef<boolean | null>(null);
  const syncInFlightRef = React.useRef(false);
  const autoSyncTriggeredRef = React.useRef(false);
  const runGroupSyncRef = React.useRef<() => Promise<void>>(async () => {});

  const stats = React.useMemo(
    () => computeChannelStats(channels),
    [channels]
  );

  /** Guide shows when missing, or when user reopens מדריך התקנה. */
  const showInstallGuide = guideForcedOpen || extensionReady === false;

  const setReady = React.useCallback((ready: boolean) => {
    extensionReadyRef.current = ready;
    setExtensionReady(ready);
  }, []);

  const runGroupSync = React.useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncMessageTone("neutral");
    try {
      setSyncMessage("פותח את רשימת הקבוצות בפייסבוק…");

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
        setSyncMessageTone("amber");
        setSyncMessage(
          scraped.error ||
            "התוסף לא הצליח לקרוא קבוצות — ודאו שאתם מחוברים לפייסבוק"
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
      } | null;

      if (!res.ok || !data?.success) {
        if (data?.needsReauth) {
          setSyncMessageTone("amber");
          setSyncMessage("יש להתחבר מחדש עם פייסבוק כדי לסנכרן קבוצות");
          window.setTimeout(() => {
            window.location.href =
              "/api/auth/facebook?callbackUrl=%2Fdashboard%2Fchannels";
          }, 1200);
          return;
        }
        setSyncMessageTone("amber");
        setSyncMessage(data?.error || "הסנכרון נכשל");
        return;
      }

      if (Array.isArray(data.channels)) {
        setChannels(data.channels);
      }
      const count = data.channelCount ?? data.channels?.length ?? 0;

      if (data.extensionRequired || count === 0) {
        setSyncMessageTone("amber");
        setSyncMessage(
          "לא נמצאו קבוצות אמיתיות. התחברו לפייסבוק באותו דפדפן שבו מותקן התוסף, ואז לחצו שוב על סנכרון קבוצות."
        );
        return;
      }

      const cleaned =
        typeof data.removedFakes === "number" && data.removedFakes > 0
          ? ` (הוסרו ${data.removedFakes} קבוצות בדיקה)`
          : "";
      setSyncMessageTone("success");
      setSyncMessage(`הסנכרון הושלם — ${count} קבוצות אמיתיות${cleaned}`);
    } catch (err) {
      setSyncMessageTone("amber");
      setSyncMessage(err instanceof Error ? err.message : "שגיאת סנכרון");
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }, []);

  runGroupSyncRef.current = runGroupSync;

  const triggerPostInstallSync = React.useCallback(() => {
    if (autoSyncTriggeredRef.current || syncInFlightRef.current) return;
    autoSyncTriggeredRef.current = true;
    awaitingInstallRef.current = false;
    setGuideForcedOpen(false);
    setSyncMessageTone("success");
    setSyncMessage("התוסף הותקן בהצלחה! מסנכרן קבוצות...");
    void runGroupSyncRef.current();
  }, []);

  /**
   * Mark extension installed. Auto-sync only when:
   * - user is awaiting install (sync click / store open / recheck), or
   * - we previously knew it was missing (false → true).
   * Cold load with extension already present (null → true) does NOT auto-sync.
   */
  const onFound = React.useCallback(
    (mode: "silent" | "auto") => {
      const prev = extensionReadyRef.current;
      setReady(true);

      if (mode === "silent") return;

      // Auto-sync only after a real missing→installed transition or explicit await.
      const shouldAutoSync =
        awaitingInstallRef.current || prev === false;
      if (!shouldAutoSync) return;

      setGuideForcedOpen(false);
      triggerPostInstallSync();
    },
    [setReady, triggerPostInstallSync]
  );

  React.useEffect(() => {
    const unsub = onExtensionReady(() => {
      // Bridge announce after install → auto if we were missing/awaiting.
      const prev = extensionReadyRef.current;
      if (awaitingInstallRef.current || prev === false) {
        onFound("auto");
      } else {
        onFound("silent");
      }
    });

    pingExtension((ok) => {
      if (ok) onFound("silent");
      else setReady(false);
    });

    return unsub;
  }, [onFound, setReady]);

  // While guide is visible: poll every 2s + focus / visibilitychange.
  React.useEffect(() => {
    if (!showInstallGuide) return;

    const recheck = () => {
      if (syncInFlightRef.current) return;
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      pingExtension((ok) => {
        if (!ok) {
          if (extensionReadyRef.current !== true) setReady(false);
          return;
        }
        // Found while guide open → treat as install completion when missing/awaiting.
        onFound("auto");
      });
    };

    const onFocus = () => recheck();
    const onVisibility = () => {
      if (document.visibilityState === "visible") recheck();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(recheck, 2000);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [showInstallGuide, onFound, setReady]);

  const handleSyncClick = React.useCallback(async () => {
    if (syncInFlightRef.current) return;

    const hasExt = await pingExtensionAsync();
    if (!hasExt) {
      setReady(false);
      awaitingInstallRef.current = true;
      autoSyncTriggeredRef.current = false;
      setGuideForcedOpen(true);
      setSyncMessageTone("amber");
      setSyncMessage(
        "התקינו את התוסף לפי המדריך למעלה — אחרי ההתקנה נסנכרן אוטומטית כשתחזרו לכאן."
      );
      window.open(CHROME_STORE_URL, "_blank", "noopener,noreferrer");
      return;
    }

    awaitingInstallRef.current = false;
    setReady(true);
    setGuideForcedOpen(false);
    await runGroupSync();
  }, [runGroupSync, setReady]);

  const handleRecheckAndSync = React.useCallback(async () => {
    setCheckingInstall(true);
    awaitingInstallRef.current = true;
    autoSyncTriggeredRef.current = false;
    try {
      const hasExt = await pingExtensionAsync();
      if (hasExt) {
        // Force post-install path.
        extensionReadyRef.current = false;
        onFound("auto");
        return;
      }
      setReady(false);
      setSyncMessageTone("amber");
      setSyncMessage(
        'עדיין לא זיהינו את התוסף. לחצו "הוספה לכרום" בחנות, ואז חזרו לכאן או נסו שוב.'
      );
    } finally {
      setCheckingInstall(false);
    }
  }, [onFound, setReady]);

  const buttonLabel =
    extensionReady === false ? "התקן תוסף" : t("syncGroups");

  return (
    <div className="space-y-6" dir="rtl">
      <ExtensionInstallGuide
        open={showInstallGuide}
        checking={checkingInstall || syncing}
        onClose={
          guideForcedOpen ? () => setGuideForcedOpen(false) : undefined
        }
        onRecheckAndSync={() => void handleRecheckAndSync()}
      />

      {extensionReady === true && !guideForcedOpen ? (
        <p
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
          role="status"
        >
          התוסף מחובר
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {extensionReady
            ? "סנכרון דרך תוסף DISTRO — קורא את הקבוצות מפייסבוק עם הסשן המחובר שלכם."
            : "נדרש תוסף DISTRO בכרום כדי לסנכרן קבוצות אמיתיות (בלי קבוצות בדיקה)."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ExtensionGuideButton onClick={() => setGuideForcedOpen(true)} />
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
      </div>

      {syncMessage ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm font-medium ${
            syncMessageTone === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : syncMessageTone === "amber"
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
