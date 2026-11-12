/** Shared null-safe helpers for Turso rows and dashboard DTOs. */

export function safeIso(value: unknown, fallback: string | null = null): string | null {
  if (value == null || value === "") return fallback;
  try {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return fallback;
      return value.toISOString();
    }
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toISOString();
  } catch {
    return fallback;
  }
}

export function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value);
}

/** Parse fetch Response as JSON without throwing on HTML/empty 500 bodies. */
export async function safeJson<T = unknown>(
  res: Response | null | undefined
): Promise<T | null> {
  if (!res) return null;
  try {
    const text = await res.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
