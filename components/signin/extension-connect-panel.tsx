"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Chrome, Loader2 } from "lucide-react";
import { pushAuthToExtension } from "@/components/auth/extension-auth-bridge";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { useI18n } from "@/lib/i18n";
import { CHROME_WEB_STORE_URL } from "@/lib/support";

const POLL_MS = 2500;

type ExtensionConnectPanelProps = {
  allowDevLogin: boolean;
};

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

export function ExtensionConnectPanel({
  allowDevLogin,
}: ExtensionConnectPanelProps) {
  const router = useRouter();
  const { dir, t } = useI18n();
  const [listening, setListening] = React.useState(true);
  const [statusLabel, setStatusLabel] = React.useState(t("loading"));

  React.useEffect(() => {
    setStatusLabel(
      dir === "rtl" ? "ממתינים לסנכרון מהתוסף…" : "Waiting for extension sync…"
    );
  }, [dir]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          connected?: boolean;
          channelCount?: number;
          extensionToken?: string;
        };
        if (cancelled) return;
        if (data.connected) {
          if (data.extensionToken) {
            pushAuthToExtension(data.extensionToken);
          }
          setListening(false);
          setStatusLabel(
            dir === "rtl"
              ? `התוסף התחבר — ${data.channelCount ?? 0} קבוצות. מעבירים ללוח הבקרה…`
              : `Extension connected — ${data.channelCount ?? 0} groups. Opening dashboard…`
          );
          router.replace("/dashboard/channels");
          router.refresh();
          return;
        }
        setStatusLabel(
          dir === "rtl"
            ? "ממתינים לסנכרון מהתוסף…"
            : "Waiting for extension sync…"
        );
      } catch {
        if (!cancelled) {
          setStatusLabel(
            dir === "rtl"
              ? "בודקים חיבור… נסו שוב בעוד רגע"
              : "Checking connection… try again shortly"
          );
        }
      }
      if (!cancelled) {
        timer = setTimeout(() => {
          void check();
        }, POLL_MS);
      }
    };

    void check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [router, dir]);

  return (
    <div className="space-y-5" dir={dir}>
      <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 text-start">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            {t("installTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("installSubtitle")}</p>
        </div>

        <a
          href={CHROME_WEB_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#4285F4] px-4 text-sm font-semibold text-white shadow transition-colors hover:bg-[#3367D6]"
        >
          <ChromeStoreIcon className="size-5 shrink-0" />
          {t("installWebStore")}
        </a>

        <div className="flex gap-3 rounded-lg border border-border/80 bg-card px-3 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700">
            <Chrome className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1 pt-0.5">
            <p className="text-sm font-medium text-foreground">
              {t("installAfterTitle")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("installAfterBody")}
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-950"
          role="status"
          aria-live="polite"
        >
          {listening ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          )}
          <span>{statusLabel}</span>
        </div>
      </section>

      {allowDevLogin ? <DevLoginButton autoLogin={false} /> : null}
    </div>
  );
}
