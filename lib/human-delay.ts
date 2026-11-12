/** Random human-like inter-group delay (seconds). */
export function randomHumanDelaySeconds(min = 45, max = 120): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

/** Short delays so a single Vercel function invocation can finish. */
export function shortDelaySeconds(): number {
  return Math.floor(1 + Math.random() * 2); // 1–2s
}
