/** JS getDay(): 0=Sunday … 6=Saturday */

export type ScheduleType = "immediate" | "once" | "recurring";

export type ScheduleEndMode = "never" | "end_date" | "max_runs";

export type ScheduleConfig = {
  scheduleType: ScheduleType;
  /** One-shot datetime */
  scheduledTime?: string | Date | null;
  /** Weekdays for recurring (0–6) */
  daysOfWeek?: number[];
  /** "HH:MM" local */
  runTime?: string;
  endDate?: string | Date | null;
  maxRuns?: number | null;
  runsCount?: number;
  isActive?: boolean;
};

export const HE_WEEKDAY_LABELS = [
  "א",
  "ב",
  "ג",
  "ד",
  "ה",
  "ו",
  "ש",
] as const;

export function parseRunTime(runTime: string): { hours: number; minutes: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((runTime || "").trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return { hours, minutes };
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Compute the next fire timestamp for a once/recurring schedule.
 * Returns null when the campaign should not run again.
 */
export function calculateNextRun(
  config: ScheduleConfig,
  from: Date = new Date()
): Date | null {
  if (config.isActive === false) return null;

  const runsCount = config.runsCount ?? 0;
  if (config.maxRuns != null && runsCount >= config.maxRuns) return null;

  if (config.scheduleType === "immediate") {
    return new Date(from.getTime() + 2_000);
  }

  if (config.scheduleType === "once") {
    if (!config.scheduledTime) return null;
    const t = new Date(config.scheduledTime);
    if (Number.isNaN(t.getTime())) return null;
    if (t.getTime() <= from.getTime()) return null;
    if (config.endDate && t > endOfDay(new Date(config.endDate))) return null;
    return t;
  }

  const days = (config.daysOfWeek || []).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6
  );
  const parsed = parseRunTime(config.runTime || "07:00");
  if (!days.length || !parsed) return null;

  const end = config.endDate ? endOfDay(new Date(config.endDate)) : null;

  // Search the next 21 days for a matching weekday + time
  for (let i = 0; i < 21; i += 1) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + i);
    candidate.setHours(parsed.hours, parsed.minutes, 0, 0);
    if (candidate.getTime() <= from.getTime()) continue;
    if (!days.includes(candidate.getDay())) continue;
    if (end && candidate.getTime() > end.getTime()) return null;
    return candidate;
  }
  return null;
}

/** After a successful run, decide whether the campaign stays active. */
export function shouldDeactivateAfterRun(config: ScheduleConfig): boolean {
  const nextRuns = (config.runsCount ?? 0) + 1;
  if (config.maxRuns != null && nextRuns >= config.maxRuns) return true;
  if (config.scheduleType === "once" || config.scheduleType === "immediate") {
    return true;
  }
  // Recurring: deactivate if no future occurrence remains
  const next = calculateNextRun(
    { ...config, runsCount: nextRuns, isActive: true },
    new Date()
  );
  return next == null;
}

export type Occurrence = {
  at: Date;
  sourceId: string;
  isVirtual: boolean;
};

/**
 * Expand a recurring (or once) schedule into concrete occurrences in [rangeStart, rangeEnd].
 */
export function expandScheduleOccurrences(
  config: ScheduleConfig & { id: string },
  rangeStart: Date,
  rangeEnd: Date,
  maxOccurrences = 60
): Occurrence[] {
  const out: Occurrence[] = [];
  if (config.isActive === false && config.scheduleType === "recurring") {
    // Still show historical nextRun if in range? Skip inactive for future calendar.
  }

  if (config.scheduleType === "once") {
    if (!config.scheduledTime) return out;
    const t = new Date(config.scheduledTime);
    if (
      !Number.isNaN(t.getTime()) &&
      t >= rangeStart &&
      t <= rangeEnd
    ) {
      out.push({ at: t, sourceId: config.id, isVirtual: false });
    }
    return out;
  }

  const days = (config.daysOfWeek || []).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6
  );
  const parsed = parseRunTime(config.runTime || "07:00");
  if (!days.length || !parsed) return out;

  const endCap = config.endDate
    ? endOfDay(new Date(config.endDate))
    : rangeEnd;
  const hardEnd = endCap < rangeEnd ? endCap : rangeEnd;

  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= hardEnd && out.length < maxOccurrences) {
    if (days.includes(cursor.getDay())) {
      const at = new Date(cursor);
      at.setHours(parsed.hours, parsed.minutes, 0, 0);
      if (at >= rangeStart && at <= hardEnd) {
        if (config.maxRuns != null) {
          // Approximate: don't know past runs distribution; show up to remaining slots
          const remaining =
            config.maxRuns - (config.runsCount ?? 0) - out.length;
          if (remaining <= 0) break;
        }
        out.push({ at, sourceId: config.id, isVirtual: true });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}
