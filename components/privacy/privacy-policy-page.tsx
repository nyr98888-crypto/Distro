"use client";

import Image from "next/image";
import Link from "next/link";
import { I18nProvider, LanguageToggle, useI18n } from "@/lib/i18n";
import { SUPPORT_EMAIL, supportHref } from "@/lib/support";

function PrivacyInner() {
  const { dir, locale, t } = useI18n();
  const href = supportHref(locale);

  return (
    <div dir={dir} lang={locale} className="min-h-screen bg-[#F8FAFC]">
      <header className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="DISTRO"
            width={32}
            height={32}
            className="rounded-md border border-slate-200 bg-white object-contain"
          />
          <span className="font-bold tracking-[0.16em] text-slate-900">
            DISTRO
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-[#2563EB]"
          >
            {t("privacyBackHome")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-4 font-sans leading-relaxed text-slate-800">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">
          {t("privacyTitle")}
        </h1>
        <p className="mb-8 text-sm text-slate-500">{t("privacyLastUpdated")}</p>

        <p className="mb-6">{t("privacyIntro")}</p>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t("privacyS1")}</h2>
          <ul className="list-disc space-y-1 ps-6">
            <li>{t("privacyS1a")}</li>
            <li>{t("privacyS1b")}</li>
            <li>{t("privacyS1c")}</li>
          </ul>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t("privacyS2")}</h2>
          <p>{t("privacyS2Body")}</p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t("privacyS3")}</h2>
          <ul className="list-disc space-y-1 ps-6">
            <li>{t("privacyS3a")}</li>
            <li>{t("privacyS3b")}</li>
          </ul>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t("privacyS4")}</h2>
          <p>{t("privacyS4Body")}</p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">{t("privacyS5")}</h2>
          <p>
            {t("privacyContact")}{" "}
            <a
              className="font-medium text-[#2563EB] hover:underline"
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return (
    <I18nProvider>
      <PrivacyInner />
    </I18nProvider>
  );
}
