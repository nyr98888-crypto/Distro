"use client";

import * as React from "react";
import { CheckCircle2, Download, Puzzle } from "lucide-react";
import {
  hasExtensionDomFlag,
  onExtensionReady,
  pingExtension,
} from "@/lib/extension-bridge";
import { useI18n } from "@/lib/i18n";
import { CHROME_STORE_URL } from "@/lib/support";
import { cn } from "@/lib/utils";

function ChromeStoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="10" fill="#4285F4" />
      <path
        d="M12 2a10 10 0 0 1 8.66 5H12v4.5L7.34 7A10 10 0 0 1 12 2Z"
        fill="#EA4335"
      />
      <path
        d="M3.34 7A10 10 0 0 0 12 22l4.66-8.07H7.34L3.34 7Z"
        fill="#FBBC05"
      />
      <path
        d="M12 22a10 10 0 0 0 8.66-15H12v5.93L16.66 13.93 12 22Z"
        fill="#34A853"
      />
      <circle cx="12" cy="12" r="4.25" fill="#fff" />
      <circle cx="12" cy="12" r="2.6" fill="#4285F4" />
    </svg>
  );
}

/** Shared detector for dashboard shell (DOM flag / postMessage / chrome.runtime). */
export function useExtensionInstalled(): boolean | null {
  const [installed, setInstalled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    if (hasExtensionDomFlag()) {
      setInstalled(true);
    }

    const unsub = onExtensionReady(() => setInstalled(true));

    const check = () => {
      pingExtension((ok) => {
        setInstalled((prev) => (ok ? true : prev === true ? true : false));
      });
    };

    check();

    const onFocus = () => check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const interval = window.setInterval(check, 8000);

    return () => {
      unsub();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return installed;
}

type StatusProps = {
  installed: boolean | null;
};

/** Compact header control: install CTA or green connected badge. */
export function ExtensionHeaderStatus({ installed }: StatusProps) {
  const { t } = useI18n();
  const storeUrl = CHROME_STORE_URL;

  if (installed === null) {
    return (
      <span className="hidden h-8 w-28 animate-pulse rounded-lg bg-slate-200/80 sm:inline-block" />
    );
  }

  if (installed) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
        role="status"
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        {t("extensionConnected")}
      </span>
    );
  }

  return (
    <a
      href={storeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-[min(100%,16rem)] items-center gap-1.5 rounded-lg bg-[#4285F4] px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#3367D6] sm:max-w-none"
    >
      <ChromeStoreIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{t("extensionDownloadCta")}</span>
    </a>
  );
}

/** Full-width top banner when the extension is missing. */
export function ExtensionInstallBanner({ installed }: StatusProps) {
  const { t, dir } = useI18n();
  const storeUrl = CHROME_STORE_URL;

  if (installed !== false) return null;

  return (
    <div
      className={cn(
        "border-b border-amber-200 bg-gradient-to-l from-amber-50 via-sky-50 to-amber-50 px-4 py-3 sm:px-6",
        dir === "rtl" && "bg-gradient-to-r"
      )}
      role="region"
      aria-label={t("extensionDownloadCta")}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
            <Puzzle className="h-4 w-4 text-[#2563EB]" aria-hidden />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-slate-900">
              {t("extensionDownloadCta")}
            </p>
            <p className="text-xs text-slate-600 sm:text-sm">
              {t("extensionBannerHint")}
            </p>
          </div>
        </div>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#4285F4] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3367D6]"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t("extensionDownloadCta")}
        </a>
      </div>
    </div>
  );
}
