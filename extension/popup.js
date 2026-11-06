const GROUPS_URL = "https://www.facebook.com/groups/joins/";

// ── API configuration (Steps 4 & 5) ──────────────────────────────────────────
// Production Vercel deployment. Change if your project URL differs.
const PRODUCTION_API_BASE = "https://distro-theta.vercel.app";
const LOCAL_API_BASE = "http://localhost:3000";

// Set true while testing against a local Next.js dashboard.
const USE_LOCAL_API = false;

const API_BASE = USE_LOCAL_API ? LOCAL_API_BASE : PRODUCTION_API_BASE;

// Must match server env DISTRO_API_KEY (Vercel / .env.local)
const DISTRO_API_KEY = "zpv9dq136kwfxcn0t285hgoeajmlryi7ub4s";

const SYNC_URL = `${API_BASE}/api/channels/sync`;

const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");

function setStatus(message, tone = "info") {
  statusEl.textContent = message;
  statusEl.classList.remove("is-ok", "is-warn", "is-err");
  if (tone === "ok") statusEl.classList.add("is-ok");
  if (tone === "warn") statusEl.classList.add("is-warn");
  if (tone === "err") statusEl.classList.add("is-err");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Scraped inside the Facebook tab (isolated world via executeScript).
 * Returns { groups, fbUserName }.
 */
function scrapeFacebookGroups() {
  const byId = new Map();

  const addGroup = (id, name, memberCount, url) => {
    if (!id || !/^\d+$/.test(String(id))) return;
    const cleanName = (name || "").replace(/\s+/g, " ").trim();
    if (!cleanName || cleanName.length < 2) return;
    const prev = byId.get(id);
    if (!prev || cleanName.length > prev.name.length) {
      byId.set(id, {
        id: String(id),
        name: cleanName,
        memberCount: Number.isFinite(memberCount) ? memberCount : undefined,
        url: url || `https://www.facebook.com/groups/${id}`,
      });
    }
  };

  const parseMembers = (text) => {
    if (!text) return undefined;
    const normalized = text
      .replace(/,/g, "")
      .replace(/\u202f/g, "")
      .replace(/[^\d.\sKkMmאלף]/g, " ");
    const match = text.match(/([\d,.]+)\s*(K|k|M|m|אלף)?/);
    if (!match) return undefined;
    let n = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isNaN(n)) return undefined;
    const suffix = match[2];
    if (suffix && /k|אלף/i.test(suffix)) n *= 1000;
    if (suffix && /m/i.test(suffix)) n *= 1_000_000;
    return Math.round(n);
  };

  // Anchor links to /groups/<id>
  document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
    const href = a.href || a.getAttribute("href") || "";
    const m = href.match(/\/groups\/(\d+)/);
    if (!m) return;

    const id = m[1];
    let name =
      a.getAttribute("aria-label") ||
      a.textContent ||
      "";

    // Prefer a nearby heading-like node when the anchor text is empty/noisy
    if (!name.trim() || name.trim().length < 2) {
      const card =
        a.closest('[role="article"], [role="listitem"], div') || a.parentElement;
      const title = card?.querySelector?.(
        'span[dir="auto"], h2, h3, strong, a[role="link"]'
      );
      name = title?.textContent || name;
    }

    let memberCount;
    const card =
      a.closest('[role="article"], [role="listitem"], div') || a.parentElement;
    const cardText = card?.textContent || "";
    const memberMatch = cardText.match(
      /([\d,.]+\s*(?:K|k|M|m|אלף)?)\s*(?:members|חברים)/i
    );
    if (memberMatch) memberCount = parseMembers(memberMatch[1]);

    addGroup(id, name, memberCount, href.split("?")[0]);
  });

  // Fallback: scan raw HTML for group id patterns near names
  if (byId.size === 0) {
    const html = document.documentElement.innerHTML;
    const re = /\/groups\/(\d{5,})/g;
    let match;
    while ((match = re.exec(html)) !== null) {
      addGroup(match[1], `Group ${match[1]}`);
    }
  }

  let fbUserName = "Facebook User";
  const profile =
    document.querySelector('[aria-label*="Your profile"]') ||
    document.querySelector('[aria-label*="הפרופיל שלך"]') ||
    document.querySelector('a[href*="/me"] span');
  if (profile?.textContent?.trim()) {
    fbUserName = profile.textContent.trim();
  }

  return {
    groups: Array.from(byId.values()),
    fbUserName,
    pageUrl: location.href,
  };
}

async function getFacebookUserId() {
  const cookie = await chrome.cookies.get({
    url: "https://www.facebook.com",
    name: "c_user",
  });
  return cookie?.value || null;
}

async function findOrOpenFacebookTab() {
  const existing = await chrome.tabs.query({
    url: ["https://www.facebook.com/*", "https://*.facebook.com/*"],
  });

  if (existing.length > 0) {
    const preferred =
      existing.find((t) => t.active) ||
      existing.find((t) => t.url?.includes("/groups/")) ||
      existing[0];
    return preferred;
  }

  setStatus("פותח את פייסבוק...", "warn");
  const tab = await chrome.tabs.create({
    url: GROUPS_URL,
    active: true,
  });
  return tab;
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("טעינת העמוד ארכה יותר מדי"));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

async function scrapeFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeFacebookGroups,
  });
  return result;
}

async function syncGroups() {
  syncBtn.disabled = true;
  try {
    setStatus("בודק התחברות...", "warn");

    const fbUserId = await getFacebookUserId();
    if (!fbUserId) {
      setStatus("לא מחוברים לפייסבוק. התחברו ואז נסו שוב.", "err");
      return;
    }

    let tab = await findOrOpenFacebookTab();
    if (!tab?.id) {
      setStatus("לא נמצא חלון פייסבוק פתוח.", "err");
      return;
    }

    const onJoins = tab.url?.includes("/groups/joins");
    if (!onJoins) {
      setStatus("עובר לעמוד הקבוצות...", "warn");
      await chrome.tabs.update(tab.id, { url: GROUPS_URL, active: true });
      await waitForTabComplete(tab.id);
      // Facebook is heavily client-rendered — give it a moment
      await sleep(2500);
      tab = await chrome.tabs.get(tab.id);
    } else {
      await sleep(800);
    }

    setStatus("סורק קבוצות מהעמוד...", "warn");
    let scraped = await scrapeFromTab(tab.id);

    // Soft retry if the SPA hadn't finished rendering
    if (!scraped?.groups?.length) {
      await sleep(2000);
      scraped = await scrapeFromTab(tab.id);
    }

    const groups = scraped?.groups || [];
    if (groups.length === 0) {
      setStatus(
        "לא נמצאו קבוצות. ודאו שאתם בעמוד הקבוצות ושיש לכם קבוצות.",
        "err"
      );
      return;
    }

    setStatus(`נמצאו ${groups.length} קבוצות — שולח לשרת...`, "warn");

    // Collect Facebook cookies to encrypt server-side into accessToken
    const fbCookies = await chrome.cookies.getAll({
      domain: ".facebook.com",
    });
    const cookies = fbCookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
    }));

    const payload = {
      fbUserId,
      fbUserName: scraped.fbUserName || "Facebook User",
      groups,
      cookies,
    };

    const res = await fetch(SYNC_URL, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-distro-key": DISTRO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      throw new Error(data.error || `שגיאת שרת (${res.status})`);
    }

    setStatus(
      `הסנכרון הושלם בהצלחה! סונכרנו ${data.syncedCount ?? groups.length} קבוצות.`,
      "ok"
    );

    // Browser navigation sets the session cookie so the open /signin tab can redirect
    const handoffPath =
      typeof data.handoffPath === "string" && data.handoffPath.startsWith("/")
        ? data.handoffPath
        : "/dashboard/channels";
    chrome.tabs.create({ url: `${API_BASE}${handoffPath}`, active: true });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "שגיאה לא ידועה בסנכרון";
    if (/Failed to fetch|NetworkError/i.test(message)) {
      setStatus(
        `לא ניתן להתחבר ל־${API_BASE}. ודאו שהפריסה ב־Vercel פעילה.`,
        "err"
      );
    } else {
      setStatus(message, "err");
    }
  } finally {
    syncBtn.disabled = false;
  }
}

syncBtn.addEventListener("click", () => {
  void syncGroups();
});
