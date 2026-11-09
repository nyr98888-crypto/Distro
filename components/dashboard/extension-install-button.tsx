"use client";

import * as React from "react";
import { Download, Puzzle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    title: "הורידו וחלצו",
    body: "לחצו על כפתור ההורדה למטה, ואז חלצו (Extract) את קובץ ה-ZIP לתיקייה קבועה במחשב.",
  },
  {
    title: "טענו כתוסף לא ארוז",
    body: "chrome://extensions",
    isChromeUrl: true,
  },
  {
    title: "סנכרנו קבוצות",
    body: "פתחו את פייסבוק, לחצו על אייקון Distro בסרגל התוספים, ולחצו Sync Groups — הקבוצות יופיעו בדשבורד.",
  },
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
        <span className="hidden sm:inline">התקנת תוסף כרום לסנכרון</span>
        <span className="sm:hidden">התקנת תוסף</span>
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

          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-white p-5 text-right shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="extension-install-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  התקנת תוסף Distro
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  לפני פרסום ב-Chrome Web Store — התקינו מקומית ב־3 שלבים.
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
              className="mb-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#1877f2] px-4 text-sm font-medium text-white shadow transition-colors hover:bg-[#166fe5]"
            >
              <Download className="size-4" />
              הורד תוסף Distro (ZIP)
            </a>

            <ol className="space-y-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-900">
                    {index + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="font-semibold text-slate-900">{step.title}</p>
                    {"isChromeUrl" in step && step.isChromeUrl ? (
                      <p className="mt-1 text-slate-600">
                        פתחו{" "}
                        <code
                          dir="ltr"
                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800"
                        >
                          chrome://extensions
                        </code>
                        , הפעילו Developer mode, לחצו Load unpacked ובחרו את
                        התיקייה שחילצתם.
                      </p>
                    ) : (
                      <p className="mt-1 text-slate-600">{step.body}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              באנדרואיד אפשר להריץ את אותו תוסף דרך Kiwi Browser או Lemur Browser
              מ־Google Play. ב־iOS אין תמיכה בתוספי כרום.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
