"use client";

import * as React from "react";
import { BookOpen, Loader2, X } from "lucide-react";
import { CHROME_STORE_URL } from "@/lib/support";
import { cn } from "@/lib/utils";

type ExtensionInstallGuideProps = {
  open: boolean;
  checking?: boolean;
  onClose?: () => void;
  onRecheckAndSync: () => void;
  className?: string;
};

const STEPS = [
  {
    n: 1,
    title: "הורדת התוסף",
    body: 'לחץ על הכפתור הכחול למטה. ייפתח חלון של חנות כרום — לחץ שם על "הוספה לכרום" (Add to Chrome) ואז על "הוסף תוסף" (Add extension).',
  },
  {
    n: 2,
    title: "לוודא שאתה מחובר לפייסבוק",
    body: "ודא שבאותו דפדפן כרום אתה מחובר לחשבון הפייסבוק שלך (אם לא, פתח לשונית חדשה, היכנס לפייסבוק וחזור לכאן).",
  },
  {
    n: 3,
    title: "סנכרון אוטומטי של הקבוצות",
    body: 'מיד אחרי שתלחץ "הוסף תוסף", חזור ללשונית הזו — המערכת תזהה את התוסף לבד ותמשוך את כל הקבוצות שלך אוטומטית.',
  },
] as const;

export function ExtensionInstallGuide({
  open,
  checking = false,
  onClose,
  onRecheckAndSync,
  className,
}: ExtensionInstallGuideProps) {
  if (!open) return null;

  return (
    <section
      dir="rtl"
      className={cn(
        "rounded-2xl border-2 border-[#2563EB]/25 bg-white p-5 shadow-md ring-1 ring-[#2563EB]/10 sm:p-6",
        className
      )}
      role="region"
      aria-labelledby="extension-install-guide-title"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#2563EB]">
            מדריך התקנה · 30 שניות
          </p>
          <h2
            id="extension-install-guide-title"
            className="text-lg font-bold leading-snug text-slate-900 sm:text-xl"
          >
            כדי להתחיל, מתקינים את התוסף ב-30 שניות (חד פעמי):
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            aria-label="סגור מדריך"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <ol className="space-y-4">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2563EB] text-lg font-black text-white shadow-sm"
              aria-hidden
            >
              {step.n}
            </span>
            <div className="min-w-0 space-y-1.5 pt-0.5">
              <p className="text-base font-bold text-slate-900">
                שלב {step.n} — {step.title}
              </p>
              <p className="text-sm leading-relaxed text-slate-700">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-3">
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3.5 text-center text-base font-bold text-white shadow-md transition hover:bg-[#1D4ED8]"
        >
          1. לחץ כאן להורדת התוסף מחנות כרום ↗
        </a>

        <button
          type="button"
          onClick={onRecheckAndSync}
          disabled={checking}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-[#2563EB] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] disabled:opacity-60"
        >
          {checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : null}
          התקנתי! בדוק שוב וסנכרן קבוצות עכשיו
        </button>

        <p className="text-center text-xs text-slate-500">
          אחרי ההתקנה חזרו ללשונית הזו — נזהה את התוסף ונמשוך את הקבוצות
          אוטומטית.
        </p>
      </div>
    </section>
  );
}

/** Subtle control to reopen the install guide anytime. */
export function ExtensionGuideButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
        className
      )}
    >
      <BookOpen className="h-4 w-4" aria-hidden />
      מדריך התקנה
    </button>
  );
}
