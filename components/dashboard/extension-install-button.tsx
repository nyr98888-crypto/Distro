"use client";

import * as React from "react";
import { Puzzle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { CHROME_WEB_STORE_URL } from "@/lib/support";

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

export function ExtensionInstallButton() {
  const [open, setOpen] = React.useState(false);
  const { dir, t } = useI18n();

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
        <span className="hidden sm:inline">{t("installTitle")}</span>
        <span className="sm:hidden">{t("installTitle")}</span>
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
            aria-label={t("close")}
            onClick={() => setOpen(false)}
          />

          <div
            dir={dir}
            className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-white p-5 text-start shadow-xl sm:p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="extension-install-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {t("installTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("installSubtitle")}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
              >
                <X className="size-4" />
              </Button>
            </div>

            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#4285F4] px-4 text-sm font-semibold text-white shadow transition-colors hover:bg-[#3367D6]"
            >
              <ChromeStoreIcon className="size-5" />
              {t("installWebStore")}
            </a>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {t("installAfterTitle")}
              </p>
              <p className="mt-1 leading-relaxed">{t("installAfterBody")}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
