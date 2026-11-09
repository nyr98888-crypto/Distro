/** Shared schedule helpers for the extension service worker (plain JS). */

function parseRunTime(runTime) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(runTime || "").trim());
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

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * @param {object} config
 * @param {Date} [from]
 * @returns {Date|null}
 */
function calculateNextRun(config, from = new Date()) {
  if (config.isActive === false) return null;
  const runsCount = config.runsCount ?? 0;
  if (config.maxRuns != null && runsCount >= config.maxRuns) return null;

  if (config.scheduleType === "immediate") {
    return new Date(from.getTime() + 2000);
  }

  if (config.scheduleType === "once" || !config.scheduleType) {
    if (!config.scheduledTime && !config.nextRunAt) return null;
    const t = new Date(config.nextRunAt || config.scheduledTime);
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

function shouldDeactivateAfterRun(config) {
  const nextRuns = (config.runsCount ?? 0) + 1;
  if (config.maxRuns != null && nextRuns >= config.maxRuns) return true;
  if (config.scheduleType !== "recurring") return true;
  const next = calculateNextRun(
    { ...config, runsCount: nextRuns, isActive: true },
    new Date()
  );
  return next == null;
}

// Export for importScripts / bundling-free service worker
if (typeof self !== "undefined") {
  self.calculateNextRun = calculateNextRun;
  self.shouldDeactivateAfterRun = shouldDeactivateAfterRun;
}
