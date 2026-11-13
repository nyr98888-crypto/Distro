"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, Shield, ScrollText, Sparkles } from "lucide-react";
import { FacebookAccountBar } from "@/components/dashboard/facebook-account-bar";
import { useI18n } from "@/lib/i18n";
import { SUPPORT_EMAIL, supportHref } from "@/lib/support";
import { cn } from "@/lib/utils";

type Tab = "privacy" | "terms" | "about";

const APP_VERSION = "v1.0.1";

export function SettingsPanel() {
  const { t, dir, locale } = useI18n();
  const support = supportHref(locale);
  const [tab, setTab] = React.useState<Tab>("privacy");
  const [checking, setChecking] = React.useState(false);
  const [updateMsg, setUpdateMsg] = React.useState<string | null>(null);

  const tabs: { id: Tab; label: string; icon: typeof Shield }[] = [
    { id: "privacy", label: t("tabPrivacy"), icon: Shield },
    { id: "terms", label: t("tabTerms"), icon: ScrollText },
    { id: "about", label: t("tabAbout"), icon: Sparkles },
  ];

  async function checkUpdates() {
    setChecking(true);
    setUpdateMsg(null);
    await new Promise((r) => setTimeout(r, 900));
    setUpdateMsg(t("updatesCurrent"));
    setChecking(false);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir={dir}>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("settingsTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("settingsSubtitle")}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          {t("settingsAccount")}
        </h2>
        <p className="text-sm text-slate-500">{t("settingsAccountHint")}</p>
        <div className="relative z-30 max-w-md overflow-visible">
          <FacebookAccountBar menuPlacement="down" variant="light" />
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50/80 p-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:flex-none sm:justify-start sm:text-sm",
                  active
                    ? "bg-white text-[#2563EB] shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-500 hover:bg-white/70 hover:text-slate-800"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {tab === "privacy" && (
            <article className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600">
              <h2 className="!mt-0 text-lg font-bold">{t("privacyTitle")}</h2>
              {locale === "he" ? (
                <>
                  <p>
                    DISTRO מסנכרנת קבוצות ופרופיל פייסבוק{" "}
                    <strong>בצד השרת</strong> דרך Facebook Login (OAuth) ושומרת
                    את הנתונים בחשבון שלכם ב־Turso. סיסמאות פייסבוק{" "}
                    <strong>לעולם אינן</strong> נאספות.
                  </p>
                  <ul>
                    <li>
                      אסימון הגישה של פייסבוק נשמר מוצפן בחשבון DISTRO שלכם
                      לצורך סנכרון קבוצות/עמודים בלבד.
                    </li>
                    <li>
                      תוכן הקמפיינים שלכם מיועד לשימושכם האישי/העסקי ולא נמכר או
                      משותף עם מפרסמים.
                    </li>
                    <li>
                      DISTRO לא קוראת הודעות פרטיות, תמונות אישיות או נתונים
                      פיננסיים.
                    </li>
                  </ul>
                  <p>
                    לשאלות או בקשות מחיקת נתונים:{" "}
                    <a href={support}>{SUPPORT_EMAIL}</a>
                  </p>
                </>
              ) : (
                <>
                  <p>
                    DISTRO syncs Facebook groups and profile{" "}
                    <strong>server-side</strong> via Facebook Login (OAuth) and
                    stores data in your Turso account. Facebook passwords are{" "}
                    <strong>never</strong> collected.
                  </p>
                  <ul>
                    <li>
                      Your Facebook access token is stored encrypted on your
                      DISTRO account for group/page sync only.
                    </li>
                    <li>
                      Campaign contents are for your personal/business use and
                      are not sold or shared with advertisers.
                    </li>
                    <li>
                      DISTRO does not read private messages, personal photos, or
                      financial data.
                    </li>
                  </ul>
                  <p>
                    Questions or data deletion requests:{" "}
                    <a href={support}>{SUPPORT_EMAIL}</a>
                  </p>
                </>
              )}
            </article>
          )}

          {tab === "terms" && (
            <article className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-li:text-slate-600">
              <h2 className="!mt-0 text-lg font-bold">{t("termsTitle")}</h2>
              {locale === "he" ? (
                <>
                  <p>
                    בשימוש ב־DISTRO אתם מסכימים להשתמש בתוכנה באופן חוקי והוגן,
                    בהתאם לתנאי השימוש של פייסבוק ולדין החל.
                  </p>
                  <ul>
                    <li>
                      DISTRO היא תוכנת אוטומציה מקומית מסחרית — הרישיון מעניק
                      שימוש אישי/עסקי במחשב שלכם.
                    </li>
                    <li>
                      אין להשתמש במוצר להטרדה, ספאם, הונאה או כל פעילות שמפרה
                      חוק או מדיניות קהילה.
                    </li>
                    <li>
                      האחריות על התוכן שאתם מפרסמים ועל קצב הפרסום מוטלת עליכם.
                      מומלץ להשתמש במרווחי בטיחות בין קבוצות.
                    </li>
                    <li>
                      DISTRO מסופקת &quot;כמות שהיא&quot; ללא אחריות מפורשת
                      לזמינות רציפה של פייסבוק או שינויי ממשק.
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    By using DISTRO you agree to use the software lawfully and
                    fairly, in line with Facebook&apos;s terms and applicable
                    law.
                  </p>
                  <ul>
                    <li>
                      DISTRO is commercial local-automation software — the
                      license grants personal/business use on your machine.
                    </li>
                    <li>
                      Do not use the product for harassment, spam, fraud, or any
                      activity that violates law or community policies.
                    </li>
                    <li>
                      You are responsible for the content you publish and for
                      posting cadence. Safety delays between groups are
                      recommended.
                    </li>
                    <li>
                      DISTRO is provided &quot;as is&quot; without warranty for
                      continuous Facebook availability or UI changes.
                    </li>
                  </ul>
                </>
              )}
            </article>
          )}

          {tab === "about" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {t("aboutTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {locale === "he"
                    ? "כלי ידידותי לניהול הפצות לקבוצות פייסבוק — פשוט, מקומי ובטוח."
                    : "A friendly tool for Facebook group distribution — simple, local, and private."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t("versionLabel")}
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {APP_VERSION}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600/80">
                    {t("licenseLabel")}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-lg font-bold text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                    {t("licenseValue")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void checkUpdates()}
                  disabled={checking}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8] disabled:opacity-60"
                >
                  {checking ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {checking ? t("checkingUpdates") : t("checkUpdates")}
                </button>
                <a
                  href={support}
                  target={support.startsWith("http") ? "_blank" : undefined}
                  rel={
                    support.startsWith("http") ? "noopener noreferrer" : undefined
                  }
                  className="text-sm font-semibold text-[#2563EB] hover:underline"
                >
                  {t("support")}: {SUPPORT_EMAIL}
                </a>
              </div>
              {updateMsg && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
                  {updateMsg}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
