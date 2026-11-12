"use client";

import { useI18n } from "@/lib/i18n";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.49 0-1.955.928-1.955 1.879v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

type FacebookLoginButtonProps = {
  className?: string;
};

const FACEBOOK_AUTH_HREF =
  "/api/auth/facebook?callbackUrl=%2Fdashboard%2Fchannels";

/** One-click Facebook Login — navigates to /api/auth/facebook (OAuth dialog). */
export function FacebookLoginButton({ className }: FacebookLoginButtonProps) {
  const { t } = useI18n();

  return (
    <a
      href={FACEBOOK_AUTH_HREF}
      className={
        className ??
        "inline-flex h-12 w-full max-w-sm items-center justify-center gap-2.5 rounded-xl bg-[#1877F2] px-5 text-base font-semibold text-white shadow-sm transition hover:bg-[#166FE5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2]/60"
      }
    >
      <FacebookIcon className="size-5 shrink-0" />
      {t("continueWithFacebook")}
    </a>
  );
}
