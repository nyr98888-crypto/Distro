"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FacebookLoginButton } from "@/components/auth/facebook-login-button";
import { PasswordLoginForm } from "@/components/auth/password-login-form";
import { ExtensionConnectPanel } from "@/components/signin/extension-connect-panel";
import { I18nProvider, LanguageToggle, useI18n } from "@/lib/i18n";
import { supportHref } from "@/lib/support";

type SignInScreenProps = {
  allowDevLogin: boolean;
};

function SignInInner({ allowDevLogin }: SignInScreenProps) {
  const { dir, locale, t } = useI18n();
  const support = supportHref(locale);
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  return (
    <div
      dir={dir}
      lang={locale}
      className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 py-10 text-slate-900"
    >
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

        <div className="space-y-1 text-start">
          <h1 className="text-2xl font-bold tracking-tight">{t("loginTitle")}</h1>
          <p className="text-sm text-slate-600">{t("loginSubtitle")}</p>
        </div>

        {oauthError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            role="alert"
          >
            {oauthError}
          </p>
        ) : null}

        <section className="space-y-2">
          <FacebookLoginButton />
          <p className="text-center text-xs text-slate-500">
            {t("continueWithFacebookHint")}
          </p>
        </section>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 font-medium text-slate-500">
              {t("loginWithEmail")}
            </span>
          </div>
        </div>

        <section className="space-y-3">
          <PasswordLoginForm />
        </section>

        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-2 font-medium uppercase tracking-wide text-slate-500">
              {t("loginOr")}
            </span>
          </div>
        </div>

        <ExtensionConnectPanel allowDevLogin={allowDevLogin} />

        <p className="text-center text-xs text-slate-500">
          <a
            href={support}
            target={support.startsWith("http") ? "_blank" : undefined}
            rel={support.startsWith("http") ? "noopener noreferrer" : undefined}
            className="font-medium text-[#2563EB] hover:underline"
          >
            {t("support")}
          </a>
          {" · "}
          <Link href="/privacy" className="hover:text-slate-800">
            {t("landingNavPrivacy")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export function SignInScreen(props: SignInScreenProps) {
  return (
    <I18nProvider>
      <Suspense fallback={null}>
        <SignInInner {...props} />
      </Suspense>
    </I18nProvider>
  );
}
