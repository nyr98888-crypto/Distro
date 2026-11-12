/**
 * Realistic Hebrew Facebook test groups for standalone Vercel demos
 * when Graph /me/accounts returns no pages (Groups API deprecated).
 */
export const TEST_FACEBOOK_GROUPS = [
  {
    facebookGroupId: "918273645019283",
    name: "נדל״ן תל אביב והמרכז — דירות למכירה",
    memberCount: 42850,
    url: "https://www.facebook.com/groups/918273645019283",
  },
  {
    facebookGroupId: "847291056384720",
    name: "יד שנייה — רמת גן וגבעתיים",
    memberCount: 19340,
    url: "https://www.facebook.com/groups/847291056384720",
  },
  {
    facebookGroupId: "763948215607148",
    name: "עסקים קטנים בישראל — קידום ושיווק",
    memberCount: 31200,
    url: "https://www.facebook.com/groups/763948215607148",
  },
  {
    facebookGroupId: "692847103958261",
    name: "אימהות בירושלים — המלצות וטיפים",
    memberCount: 27610,
    url: "https://www.facebook.com/groups/692847103958261",
  },
  {
    facebookGroupId: "581936472048195",
    name: "חיפוש עבודה בהייטק — ישראל",
    memberCount: 54120,
    url: "https://www.facebook.com/groups/581936472048195",
  },
] as const;

export const TEST_GROUP_TAG = "בדיקה";

/** Random human-like inter-group delay (seconds). */
export function randomHumanDelaySeconds(
  min = 45,
  max = 120
): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

/** Short delays so a single Vercel function invocation can finish. */
export function testModeDelaySeconds(): number {
  return Math.floor(1 + Math.random() * 2); // 1–2s
}
