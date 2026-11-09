"use client";

import Image from "next/image";
import Link from "next/link";
import { Shield, Sparkles, Users } from "lucide-react";
import {
  I18nProvider,
  LanguageToggle,
  useI18n,
} from "@/lib/i18n";
import { supportHref, supportLabel } from "@/lib/support";

const FEATURE_ICONS = [Users, Sparkles, Shield] as const;

function LandingInner() {
  const { dir, locale, t } = useI18n();
  const support = supportHref(locale);
  const features = [
    {
      title: t("landingFeature1Title"),
      body: t("landingFeature1Body"),
    },
    {
      title: t("landingFeature2Title"),
      body: t("landingFeature2Body"),
    },
    {
      title: t("landingFeature3Title"),
      body: t("landingFeature3Body"),
    },
  ];

  return (
    <div
      dir={dir}
      lang={locale}
      className="relative min-h-screen overflow-hidden bg-[#F8FAFC] text-slate-900"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.12),_transparent_55%),linear-gradient(180deg,#F8FAFC_0%,#EEF4FF_42%,#F8FAFC_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#94a3b8_0.8px,transparent_0.8px)] [background-size:18px_18px]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="DISTRO"
            width={40}
            height={40}
            className="rounded-lg border border-slate-200 bg-white object-contain shadow-sm"
            priority
          />
          <span className="text-xl font-bold tracking-[0.18em] text-slate-900">
            DISTRO
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-3 text-sm text-slate-600 sm:gap-5">
          <LanguageToggle className="order-last sm:order-first" />
          <a
            href={support}
            target={support.startsWith("http") ? "_blank" : undefined}
            rel={support.startsWith("http") ? "noopener noreferrer" : undefined}
            className="transition hover:text-[#2563EB]"
          >
            {t("landingNavSupport")}
          </a>
          <Link href="/privacy" className="transition hover:text-[#2563EB]">
            {t("landingNavPrivacy")}
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-[#2563EB] px-3.5 py-2 font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8]"
          >
            {t("landingNavSignIn")}
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-12 px-6 pb-20 pt-10 md:pt-16">
        <section className="max-w-3xl space-y-6 text-start">
          <p className="text-sm font-semibold tracking-wide text-[#2563EB]">
            DISTRO
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-900 md:text-5xl md:leading-[1.15]">
            {t("landingHeroTitle")}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            {t("landingHeroSubtitle")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[#2563EB] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8]"
            >
              {t("landingCtaStart")}
            </Link>
            <Link
              href="/privacy"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white/80 px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-white"
            >
              {t("landingCtaPrivacy")}
            </Link>
          </div>
        </section>

        <section className="grid gap-4 border-t border-slate-200/80 pt-10 md:grid-cols-3">
          {features.map((item, index) => {
            const Icon = FEATURE_ICONS[index]!;
            return (
              <article
                key={item.title}
                className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-sm"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#2563EB]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h2 className="text-base font-bold text-slate-900">
                  {item.title}
                </h2>
                <p className="text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </article>
            );
          })}
        </section>

        <footer className="border-t border-slate-200/80 pt-8 text-sm text-slate-500">
          <p>
            {supportLabel(locale)}:{" "}
            <a
              className="font-medium text-[#2563EB] underline-offset-2 hover:underline"
              href={support}
              target={support.startsWith("http") ? "_blank" : undefined}
              rel={support.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {t("landingNavSupport")}
            </a>
          </p>
          <p className="mt-2">
            <Link href="/privacy" className="hover:text-slate-800">
              {t("landingNavPrivacy")}
            </Link>
            {" · "}
            <Link href="/login" className="hover:text-slate-800">
              {t("landingNavSignIn")}
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

export function LandingPage() {
  return (
    <I18nProvider>
      <LandingInner />
    </I18nProvider>
  );
}
