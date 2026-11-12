/** Canonical production web app URL used by the extension and onboarding. */
export const PRODUCTION_APP_URL = "https://distro-ecru.vercel.app";

export function getAppUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (fromEnv) {
    return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return PRODUCTION_APP_URL;
}
