"use client";

import { useI18n, type TranslationKey } from "@/lib/i18n";

type PageHeaderProps = {
  titleKey: TranslationKey;
  subtitleHe: string;
  subtitleEn: string;
};

export function PageHeader({
  titleKey,
  subtitleHe,
  subtitleEn,
}: PageHeaderProps) {
  const { t, locale, dir } = useI18n();
  return (
    <div dir={dir}>
      <h1 className="text-2xl font-bold text-slate-900">{t(titleKey)}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {locale === "he" ? subtitleHe : subtitleEn}
      </p>
    </div>
  );
}
