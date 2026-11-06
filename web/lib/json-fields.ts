/**
 * Helpers for SQLite/Turso fields stored as JSON strings
 * (Prisma has no native String[] / Json array on SQLite).
 */

export function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function stringifyStringArray(values: string[]): string {
  return JSON.stringify(values);
}

/** Merge tags into an existing JSON-string tag list (deduped, sorted). */
export function mergeTags(existingJson: string, newTags: string[]): string {
  const current = new Set(parseStringArray(existingJson));
  for (const tag of newTags) {
    const trimmed = tag.trim();
    if (trimmed) current.add(trimmed);
  }
  return stringifyStringArray([...current].sort());
}
