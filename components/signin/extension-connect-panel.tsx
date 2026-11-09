"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Chrome,
  Download,
  Loader2,
  ToggleRight,
} from "lucide-react";
import { pushAuthToExtension } from "@/components/auth/extension-auth-bridge";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";

const POLL_MS = 2500;

const STEPS = [
  {
    icon: Archive,
    title: "חלצו את הקובץ",
    body: "פתחו את קובץ ה־ZIP שהורדתם וחלצו אותו לתיקייה במחשב.",
  },
  {
    icon: Chrome,
    title: "פתחו את ניהול התוספים",
    body: "בכרום, בשורת הכתובת, הזינו:",
    code: "chrome://extensions",
  },
  {
    icon: ToggleRight,
    title: "הפעילו מצב מפתח",
    body: 'הפעילו את המתג "מצב מפתח" (Developer mode), לחצו "טען תוסף לא ארוז", ובחרו בתיקייה שחילצתם. אחר כך סנכרנו קבוצות מהתוסף.',
  },
] as const;

type ExtensionConnectPanelProps = {
  allowDevLogin: boolean;
};

export function ExtensionConnectPanel({
  allowDevLogin,
}: ExtensionConnectPanelProps) {
  const router = useRouter();
  const [listening, setListening] = React.useState(true);
  const [statusLabel, setStatusLabel] = React.useState(
    "ממתינים לסנכרון מהתוסף…"
  );

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
            `התוסף התחבר — ${data.channelCount ?? 0} קבוצות. מעבירים ללוח הבקרה…`
          );
          router.replace("/dashboard/channels");
          router.refresh();
          return;
        }
        setStatusLabel("ממתינים לסנכרון מהתוסף…");
      } catch {
        if (!cancelled) {
          setStatusLabel("בודקים חיבור… נסו שוב בעוד רגע");
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
  }, [router]);

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            התקנת תוסף דסטרו
          </h2>
          <p className="text-sm text-muted-foreground">
            הורידו את התוסף, התקינו בכרום, וסנכרנו קבוצות — העמוד יעביר אתכם
            אוטומטית ללוח הבקרה.
          </p>
        </div>

        <a
          href="/destro-extension.zip"
          download="destro-extension.zip"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <Download className="size-4" />
          הורדת תוסף דסטרו (ZIP)
        </a>

        <ol className="space-y-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="flex gap-3 rounded-lg border border-border/80 bg-card px-3 py-3"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                  <p className="text-sm font-medium text-foreground">
                    <span className="ml-1 tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    {step.title}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                    {"code" in step && step.code ? (
                      <>
                        {" "}
                        <code
                          dir="ltr"
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                        >
                          {step.code}
                        </code>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div
          className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-950 dark:text-sky-100"
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
