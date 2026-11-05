"use client";

import * as React from "react";
import { Download, Puzzle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  "חלץ (Extract) את קובץ ה-ZIP לתיקייה במחשב שלך.",
  'פתח בדפדפן כרום את הכתובת: chrome://extensions',
  'הפעל את מתג "מצב מפתח" (Developer mode) בפינה הימנית/שמאלית העליונה.',
  'לחץ על "טען תוסף לא ארוז" (Load unpacked) ובחר בתיקייה שחילצת.',
  'פתח את פייסבוק, לחץ על האייקון של Distro בסרגל התוספים, ולחץ "סנכרן קבוצות".',
] as const;

export function ExtensionInstallButton() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5 border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
        onClick={() => setOpen(true)}
      >
        <Puzzle className="size-4" />
        התקנת תוסף כרום
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="extension-install-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="סגור"
            onClick={() => setOpen(false)}
          />

          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-5 text-right shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="extension-install-title"
                  className="text-lg font-semibold text-foreground"
                >
                  התקנת תוסף Distro
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  סנכרנו קבוצות פייסבוק ישירות לדשבורד בכמה שלבים פשוטים.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label="סגור"
              >
                <X className="size-4" />
              </Button>
            </div>

            <a
              href="/distro-extension.zip"
              download="distro-extension.zip"
              className="mb-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              <Download className="size-4" />
              הורד תוסף Distro (ZIP)
            </a>

            <ol className="space-y-3">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-foreground">
                    {index === 1 ? (
                      <>
                        פתח בדפדפן כרום את הכתובת:{" "}
                        <code
                          dir="ltr"
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          chrome://extensions
                        </code>
                      </>
                    ) : (
                      step
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
