/** Public support + install destinations for DISTRO. */

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@distro.app";

/** Digits only, country code included (e.g. 9725XXXXXXXX). */
export const SUPPORT_WHATSAPP_E164 =
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "") || "";

/** Live Chrome Web Store listing — hardcoded so Vercel works without env edits. */
export const DEFAULT_CHROME_EXTENSION_ID = "oogolchahhanackcmgicnnokaaehmkaj";
export const DEFAULT_CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/oogolchahhanackcmgicnnokaaehmkaj";

export const CHROME_EXTENSION_ID =
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID?.trim() ||
  DEFAULT_CHROME_EXTENSION_ID;

export const CHROME_WEB_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL?.trim() ||
  process.env.NEXT_PUBLIC_CHROME_WEB_STORE_URL?.trim() ||
  DEFAULT_CHROME_STORE_URL;

/** Alias used by Sync Groups install redirect + dashboard banner. */
export const CHROME_STORE_URL = CHROME_WEB_STORE_URL;

const SUPPORT_TEXT_HE = "שלום, אני צריך עזרה ב-DISTRO";
const SUPPORT_TEXT_EN = "Hi, I need help with DISTRO";

export function supportWhatsAppUrl(locale: "he" | "en" = "he"): string | null {
  if (!SUPPORT_WHATSAPP_E164) return null;
  const text = locale === "he" ? SUPPORT_TEXT_HE : SUPPORT_TEXT_EN;
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(text)}`;
}

export function supportMailtoUrl(locale: "he" | "en" = "he"): string {
  const subject =
    locale === "he" ? "תמיכה ב-DISTRO" : "DISTRO support request";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Prefer WhatsApp when configured; otherwise mailto. */
export function supportHref(locale: "he" | "en" = "he"): string {
  return supportWhatsAppUrl(locale) || supportMailtoUrl(locale);
}

export function supportLabel(locale: "he" | "en" = "he"): string {
  if (supportWhatsAppUrl(locale)) {
    return locale === "he" ? "תמיכה בוואטסאפ" : "WhatsApp support";
  }
  return locale === "he" ? "תמיכה באימייל" : "Email support";
}
