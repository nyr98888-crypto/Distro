"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FacebookLoginButton } from "@/components/auth/facebook-login-button";
import { I18nProvider, LanguageToggle, useI18n } from "@/lib/i18n";

function SignInInner() {
  const { dir, locale, t } = useI18n();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  return (
    <div
      dir={dir}
      lang={locale}
      className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10 text-slate-900"
    >
      <div className="w-full max-w-md space-y-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="DISTRO"
              width={36}
              height={36}
              className="rounded-md border border-slate-200 object-contain"
            />
            <span className="font-bold tracking-[0.16em]">DISTRO</span>
          </Link>
          <LanguageToggle />
        </div>

        <div className="flex flex-col items-center gap-5 text-center">
          {oauthError ? (
            <p
              className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-start text-sm text-red-700"
              role="alert"
            >
              {oauthError}
            </p>
          ) : null}

          <FacebookLoginButton />
          <p className="max-w-xs text-sm text-slate-500">
            {t("continueWithFacebookHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SignInScreen() {
  return (
    <I18nProvider>
      <Suspense fallback={null}>
        <SignInInner />
      </Suspense>
    </I18nProvider>
  );
}
