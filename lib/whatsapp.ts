export const DEFAULT_WHATSAPP_MESSAGE =
  "היי, ראיתי את הפוסט שלך ואשמח לפרטים";

export const WHATSAPP_PHONE_STORAGE_KEY = "distro_whatsapp_phone";

export type WhatsAppLinkOptions = {
  enabled: boolean;
  phone: string;
  message: string;
};

/** Digits only; Israel local 05X… → 9725X… */
export function toWhatsAppInternational(phone: string): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("972") && digits.length >= 11) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return `972${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    return `972${digits}`;
  }
  if (digits.startsWith("9720") && digits.length >= 12) {
    return `972${digits.slice(4)}`;
  }
  return digits.length >= 10 ? digits : null;
}

export function formatIsraeliPhoneDisplay(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("972")) local = `0${local.slice(3)}`;
  if (local.length === 10 && local.startsWith("05")) {
    return `${local.slice(0, 3)}-${local.slice(3, 6)}${local.slice(6)}`;
  }
  return phone;
}

export function buildWhatsAppMeUrl(
  phone: string,
  message: string
): string | null {
  const intl = toWhatsAppInternational(phone);
  if (!intl) return null;
  const text = encodeURIComponent(
    (message || DEFAULT_WHATSAPP_MESSAGE).trim() || DEFAULT_WHATSAPP_MESSAGE
  );
  return `https://wa.me/${intl}?text=${text}`;
}

export function buildWhatsAppFooter(url: string): string {
  return `\n\n💬 ליצירת קשר ישיר בוואטסאפ:\n👉 ${url}`;
}

/** Strip a previously appended Distro WhatsApp footer before re-appending. */
export function stripWhatsAppFooter(text: string): string {
  return String(text || "")
    .replace(/\n*\n💬 ליצירת קשר ישיר בוואטסאפ:\n👉 https:\/\/wa\.me\/[^\s]+/g, "")
    .trimEnd();
}

export function appendWhatsAppLink(
  text: string,
  options: WhatsAppLinkOptions
): string {
  const base = stripWhatsAppFooter(text);
  if (!options.enabled) return base;
  const url = buildWhatsAppMeUrl(options.phone, options.message);
  if (!url) return base;
  return `${base}${buildWhatsAppFooter(url)}`;
}

export function readSavedWhatsAppPhone(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(WHATSAPP_PHONE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveWhatsAppPhone(phone: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = phone.trim();
    if (trimmed) localStorage.setItem(WHATSAPP_PHONE_STORAGE_KEY, trimmed);
    else localStorage.removeItem(WHATSAPP_PHONE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
