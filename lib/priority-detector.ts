/**
 * Auto-priority detection for campaign / publish jobs.
 * Client-safe — no Prisma or Node-only imports.
 */

export type PriorityResult = {
  /** 1 = Flash Urgent, 2 = High, 5 = Normal */
  priority: number;
  reason: string;
};

/** Hours before an event that qualify as Flash Urgent. */
export const FLASH_WINDOW_HOURS = 3;

export const URGENCY_KEYWORDS = [
  // Hebrew
  "היום בערב",
  "מיידי",
  "חסר שחקן",
  "דחוף",
  // English
  "tonight",
  "urgent",
  "last spot",
  "starting soon",
] as const;

export const PRIORITY_LABELS: Record<number, string> = {
  1: "⚡ עדיפות פלאש",
  2: "⚡ עדיפות גבוהה",
  5: "רגיל",
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Find the first urgency keyword that appears in content (case-insensitive). */
export function findUrgencyKeyword(content: string): string | null {
  const haystack = normalize(content);
  for (const keyword of URGENCY_KEYWORDS) {
    if (haystack.includes(normalize(keyword))) {
      return keyword;
    }
  }
  return null;
}

/**
 * Detect publish priority from post content and optional event time.
 *
 * - eventTime within 3 hours → priority 1 (Flash Urgent)
 * - urgent keywords in content → priority 2 (High Priority)
 * - otherwise → priority 5 (Normal)
 */
export function detectPriority(
  content: string,
  eventTime?: Date | string | null,
  now: Date = new Date()
): PriorityResult {
  if (eventTime) {
    const event =
      eventTime instanceof Date ? eventTime : new Date(eventTime);

    if (!Number.isNaN(event.getTime())) {
      const msUntil = event.getTime() - now.getTime();
      const hoursUntil = msUntil / (1000 * 60 * 60);

      // Only treat as flash when the event is in the future (or just starting)
      // and within the 3-hour window.
      if (hoursUntil >= -0.25 && hoursUntil <= FLASH_WINDOW_HOURS) {
        return {
          priority: 1,
          reason: `האירוע מתחיל תוך ${FLASH_WINDOW_HOURS} שעות`,
        };
      }
    }
  }

  const keyword = findUrgencyKeyword(content);
  if (keyword) {
    return {
      priority: 2,
      reason: `זוהתה מילת דחיפות: "${keyword}"`,
    };
  }

  return {
    priority: 5,
    reason: "פוסט מתוזמן רגיל",
  };
}

export function priorityBadgeLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? `Priority ${priority}`;
}
