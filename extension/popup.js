const GROUPS_URL = "https://www.facebook.com/groups/joins/";

// Live production only — https://distro-ecru.vercel.app (auu6 is DEAD)
const PRODUCTION_API_BASE = "https://distro-ecru.vercel.app";
const API_BASE = PRODUCTION_API_BASE;

// Must match server env DISTRO_API_KEY (Vercel)
const DISTRO_API_KEY = "zpv9dq136kwfxcn0t285hgoeajmlryi7ub4s";

const GROUPS_SYNC_URL = `${API_BASE}/api/groups/sync`;
const CHANNELS_SYNC_URL = `${API_BASE}/api/channels/sync`;
const SIGN_IN_URL = `${API_BASE}/signin`;
const DEAD_APP_HOST_RE = /distro-auu6\.vercel\.app|distro-theta\.vercel\.app/i;

function apiBases() {
  return [PRODUCTION_API_BASE];
}

/** Scrub cached dead hosts (old installs may still have auu6 /login). */
function ensureEcruApiBase() {
  return chrome.storage.local.get(
    ["apiBase", "productionAppUrl", "appUrl", "loginUrl"],
    (stored) => {
      const patch = {
        apiBase: PRODUCTION_API_BASE,
        productionAppUrl: PRODUCTION_API_BASE,
        loginUrl: SIGN_IN_URL,
      };
      const keysToRemove = [];
      for (const key of ["apiBase", "productionAppUrl", "appUrl", "loginUrl"]) {
        const val = stored[key];
        if (typeof val === "string" && DEAD_APP_HOST_RE.test(val)) {
          keysToRemove.push(key);
        }
      }
      const finish = () => chrome.storage.local.set(patch);
      if (keysToRemove.length) chrome.storage.local.remove(keysToRemove, finish);
      else finish();
    }
  );
}

ensureEcruApiBase();

/** Map HTTP status to a clear Hebrew popup message. */
function hebrewSyncError(status, serverError) {
  if (typeof serverError === "string" && serverError.trim()) {
    if (status === 401 || /unauthorized|unauthenticated|לא מחובר/i.test(serverError)) {
      return "יש להתחבר קודם לאתר Distro";
    }
    return serverError;
  }
  if (status === 401) return "יש להתחבר קודם לאתר Distro";
  if (status === 404) {
    return `כתובת השרת לא נמצאה (404). התוסף חייב לפנות ל־${PRODUCTION_API_BASE}`;
  }
  return `שגיאת שרת (${status})`;
}

const statusEl = document.getElementById("status");
const syncBtn = document.getElementById("syncBtn");
const signInBtn = document.getElementById("signInBtn");

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

  const NAME_NOISE = [
    /\s*פעילות אחרונה[\s\S]*$/i,
    /\s*פוסטים חדשים(?:\s+היום)?[\s\S]*$/i,
    /\s*Last active[\s\S]*$/i,
    /\s*Active now[\s\S]*$/i,
    /\s*New posts?(?:\s+today)?[\s\S]*$/i,
    /\s*[\d.,]+\s*(?:K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)[\s\S]*$/i,
    /\s*[·•|].*$/,
  ];

  const nameLooksNoisy = (name) =>
    /פעילות אחרונה|פוסטים חדשים|Last active|Active now|New posts?|members?|חברים/i.test(
      name || ""
    );

  const cleanGroupName = (raw) => {
    let name = (raw || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    name = name.split(/\n/)[0].trim();
    for (const re of NAME_NOISE) {
      name = name.replace(re, "").trim();
    }
    return name;
  };

  const parseMembers = (text) => {
    if (!text) return undefined;
    const normalized = String(text)
      .replace(/,/g, "")
      .replace(/[\u00a0\u202f\u2009\u2007]/g, " ")
      .replace(/[\u200e\u200f]/g, "")
      .trim();

    const match = normalized.match(
      /([\d]+(?:\.[\d]+)?)\s*(K|k|M|m|אלף|מיליון)?/i
    );
    if (!match) return undefined;

    let n = parseFloat(match[1]);
    if (Number.isNaN(n)) return undefined;

    const suffix = (match[2] || "").toLowerCase();
    if (suffix === "k" || suffix === "אלף") n *= 1000;
    if (suffix === "m" || suffix === "מיליון") n *= 1_000_000;
    return Math.round(n);
  };

  const findMemberCount = (root) => {
    if (!root) return undefined;

    const shortNodes = root.querySelectorAll("span, div, a");
    for (const el of shortNodes) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 48) continue;
      if (!/(?:members?|חברים)/i.test(text)) continue;
      if (!/\d/.test(text)) continue;
      const count = parseMembers(text);
      if (Number.isFinite(count) && count > 0) return count;
    }

    const blob = (root.innerText || root.textContent || "").replace(
      /\s+/g,
      " "
    );
    const patterns = [
      /([\d.,]+)\s*(K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)/i,
      /(?:members?|חברים)\s*:?\s*([\d.,]+)\s*(K|k|M|m|אלף|מיליון)?/i,
    ];
    for (const re of patterns) {
      const match = blob.match(re);
      if (!match) continue;
      const count = parseMembers(
        `${match[1]}${match[2] ? ` ${match[2]}` : ""}`
      );
      if (Number.isFinite(count) && count > 0) return count;
    }
    return undefined;
  };

  const findCard = (anchor) =>
    anchor.closest('[role="listitem"]') ||
    anchor.closest('[role="article"]') ||
    anchor.closest('[data-visualcompletion="ignore-dynamic"]') ||
    anchor.closest("div[role='row']") ||
    // Walk up a few levels — never stop at the immediate parent <div>
    (() => {
      let node = anchor.parentElement;
      for (let i = 0; i < 6 && node; i += 1) {
        const text = node.textContent || "";
        if (/(?:members?|חברים)/i.test(text)) return node;
        node = node.parentElement;
      }
      return anchor.parentElement?.parentElement || anchor.parentElement;
    })();

  const extractGroupName = (anchor, card) => {
    const candidates = [];

    // Prefer the link's own title span — not the parent container text
    const inLink =
      anchor.querySelector('span[dir="auto"]') ||
      anchor.querySelector("span") ||
      null;
    if (inLink?.textContent?.trim()) candidates.push(inLink.textContent);

    if (card) {
      for (const sel of [
        'a[role="link"] span[dir="auto"]',
        'a[role="link"] span',
        "h2",
        "h3",
        "strong",
      ]) {
        const el = card.querySelector(sel);
        if (el?.textContent?.trim()) candidates.push(el.textContent);
      }
    }

    const aria = anchor.getAttribute("aria-label");
    if (aria?.trim()) candidates.push(aria);

    let best = "";
    for (const raw of candidates) {
      const cleaned = cleanGroupName(raw);
      if (cleaned.length < 2) continue;
      if (!best) best = cleaned;
      if (!nameLooksNoisy(cleaned)) {
        if (nameLooksNoisy(best) || cleaned.length <= best.length) {
          best = cleaned;
        }
      }
    }

    return best || cleanGroupName(anchor.textContent || "");
  };

  const addGroup = (id, name, memberCount, url) => {
    if (!id || !/^\d+$/.test(String(id))) return;
    const cleanName = cleanGroupName(name);
    if (!cleanName || cleanName.length < 2) return;

    const nextCount = Number.isFinite(memberCount) ? memberCount : undefined;
    const prev = byId.get(id);

    if (!prev) {
      byId.set(id, {
        id: String(id),
        name: cleanName,
        memberCount: nextCount,
        url: url || `https://www.facebook.com/groups/${id}`,
      });
      return;
    }

    let bestName = prev.name;
    if (!nameLooksNoisy(cleanName) && nameLooksNoisy(prev.name)) {
      bestName = cleanName;
    } else if (
      !nameLooksNoisy(cleanName) &&
      cleanName.length > 0 &&
      cleanName.length < prev.name.length
    ) {
      // Prefer the shorter clean title over a container that swallowed metadata
      bestName = cleanName;
    } else if (nameLooksNoisy(prev.name) && cleanName.length >= 2) {
      bestName = cleanName;
    }

    byId.set(id, {
      ...prev,
      name: bestName,
      memberCount:
        nextCount && nextCount > 0 ? nextCount : prev.memberCount,
      url: prev.url || url || `https://www.facebook.com/groups/${id}`,
    });
  };

  // Anchor links to /groups/<id>
  document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
    const href = a.href || a.getAttribute("href") || "";
    const m = href.match(/\/groups\/(\d+)/);
    if (!m) return;

    // Skip nav / chrome links that aren't group cards
    if (/\/groups\/\d+\/(user|members|permalink)/i.test(href)) return;

    const id = m[1];
    const card = findCard(a);
    const name = extractGroupName(a, card);
    const memberCount = findMemberCount(card);

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

async function scrollAndScrapeFromTab(tabId) {
  // Injected into the Facebook tab: infinite-scroll then scrape all groups + profile.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

      async function scrollGroupsFeedToEnd() {
        let lastHeight = document.body.scrollHeight;
        let retries = 0;
        let safety = 0;
        while (retries < 4 && safety < 200) {
          safety += 1;
          window.scrollTo(0, document.body.scrollHeight);
          document
            .querySelectorAll(
              '[role="main"], [data-pagelet], div[style*="overflow"]'
            )
            .forEach((el) => {
              try {
                if (el.scrollHeight > el.clientHeight + 40) {
                  el.scrollTop = el.scrollHeight;
                }
              } catch {
                /* ignore */
              }
            });
          await sleep(1500);
          const newHeight = document.body.scrollHeight;
          if (newHeight === lastHeight) retries += 1;
          else {
            retries = 0;
            lastHeight = newHeight;
          }
        }
        window.scrollTo(0, 0);
        await sleep(400);
      }

      function getCookieValue(name) {
        const parts = document.cookie.split(";");
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.startsWith(`${name}=`)) {
            return decodeURIComponent(trimmed.slice(name.length + 1));
          }
        }
        return null;
      }

      function extractFacebookProfile() {
        const cUser = getCookieValue("c_user");
        let name = "";
        let avatarUrl = "";
        const nameSelectors = [
          '[aria-label*="Your profile"]',
          '[aria-label*="הפרופיל שלך"]',
          '[aria-label*="Account"]',
          'div[role="navigation"] a[href*="/me"]',
          'a[href^="https://www.facebook.com/me"]',
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const aria = (el.getAttribute("aria-label") || "").trim();
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          let candidate = aria || text;
          candidate = candidate
            .replace(/'?s profile$/i, "")
            .replace(/^Your profile$/i, "")
            .replace(/^הפרופיל שלך$/i, "")
            .trim();
          if (
            candidate &&
            candidate.length >= 2 &&
            candidate.length < 80 &&
            !/facebook|menu|home|דף הבית/i.test(candidate)
          ) {
            name = candidate;
            break;
          }
        }
        const imgs = Array.from(
          document.querySelectorAll(
            'div[role="banner"] img, div[role="navigation"] img, [aria-label*="profile" i] img, svg image'
          )
        );
        for (const node of imgs) {
          let src =
            node.currentSrc ||
            node.src ||
            node.getAttribute("src") ||
            node.getAttribute("xlink:href") ||
            node.getAttribute("href") ||
            "";
          const srcset = node.getAttribute?.("srcset") || "";
          if (srcset) {
            const parts = srcset
              .split(",")
              .map((p) => p.trim().split(/\s+/)[0]);
            if (parts.length) src = parts[parts.length - 1] || src;
          }
          if (
            src &&
            /scontent|fbcdn|facebook\.com\/.*\/picture|graph\.facebook/i.test(
              src
            )
          ) {
            avatarUrl = src;
            break;
          }
        }
        if (!avatarUrl && cUser) {
          avatarUrl = `https://graph.facebook.com/${cUser}/picture?type=large`;
        }
        if (!name || name.length < 2) {
          name = cUser ? `משתמש ${cUser.slice(-4)}` : "משתמש פייסבוק";
        }
        return {
          facebookId: cUser || "",
          name,
          avatarUrl,
          isConnected: Boolean(cUser),
        };
      }

      if (/\/groups\/joins/i.test(location.href)) {
        await scrollGroupsFeedToEnd();
      }

      // Reuse the same DOM collectors as popup's scrapeFacebookGroups by
      // querying all /groups/<id> anchors after scroll.
      const byId = new Map();
      const NAME_NOISE = [
        /\s*פעילות אחרונה[\s\S]*$/i,
        /\s*פוסטים חדשים(?:\s+היום)?[\s\S]*$/i,
        /\s*Last active[\s\S]*$/i,
        /\s*Active now[\s\S]*$/i,
        /\s*New posts?(?:\s+today)?[\s\S]*$/i,
        /\s*[\d.,]+\s*(?:K|k|M|m|אלף|מיליון)?\s*(?:members?|חברים)[\s\S]*$/i,
        /\s*[·•|].*$/,
      ];
      const cleanGroupName = (raw) => {
        let name = (raw || "")
          .replace(/\u00a0/g, " ")
          .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .split(/\n/)[0]
          .trim();
        for (const re of NAME_NOISE) name = name.replace(re, "").trim();
        return name;
      };
      const nameLooksNoisy = (name) =>
        /פעילות אחרונה|פוסטים חדשים|Last active|Active now|New posts?|members?|חברים/i.test(
          name || ""
        );

      document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
        const href = a.href || a.getAttribute("href") || "";
        const m = href.match(/\/groups\/(\d+)/);
        if (!m) return;
        if (/\/groups\/\d+\/(user|members|permalink)/i.test(href)) return;
        const id = m[1];
        const card =
          a.closest('[role="listitem"]') ||
          a.closest('[role="article"]') ||
          a.closest('[data-visualcompletion="ignore-dynamic"]') ||
          a.parentElement?.parentElement;
        let name =
          cleanGroupName(
            a.querySelector('span[dir="auto"]')?.textContent ||
              a.getAttribute("aria-label") ||
              a.textContent ||
              ""
          ) || `Group ${id}`;
        if (nameLooksNoisy(name) && card) {
          const better = cleanGroupName(
            card.querySelector('a[role="link"] span[dir="auto"]')?.textContent ||
              ""
          );
          if (better && !nameLooksNoisy(better)) name = better;
        }
        const prev = byId.get(id);
        if (!prev || (!nameLooksNoisy(name) && nameLooksNoisy(prev.name))) {
          byId.set(id, {
            id,
            name,
            url: href.split("?")[0],
          });
        }
      });

      const profile = extractFacebookProfile();
      return {
        groups: Array.from(byId.values()),
        fbUserName: profile.name,
        fbAvatarUrl: profile.avatarUrl,
        fbProfile: profile,
        pageUrl: location.href,
      };
    },
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

    setStatus("גולל וממתין לטעינת כל הקבוצות...", "warn");
    let scraped = await scrollAndScrapeFromTab(tab.id);

    // Soft retry if the SPA hadn't finished rendering
    if (!scraped?.groups?.length) {
      await sleep(2000);
      scraped = await scrollAndScrapeFromTab(tab.id);
    }

    const groups = scraped?.groups || [];
    if (groups.length === 0) {
      setStatus(
        "לא נמצאו קבוצות אחרי גלילה מלאה. רעננו את עמוד הקבוצות ונסו שוב.",
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

    const fbUserName = scraped.fbUserName || "Facebook User";
    const fbAvatarUrl =
      scraped.fbAvatarUrl ||
      `https://graph.facebook.com/${fbUserId}/picture?type=large`;

    await chrome.storage.local.set({
      fbProfile: {
        facebookId: fbUserId,
        name: fbUserName,
        avatarUrl: fbAvatarUrl,
        isConnected: true,
        syncedAt: Date.now(),
      },
      syncedGroups: groups.map((g) => ({
        id: String(g.id),
        name: g.name,
        url: g.url,
      })),
    });

    const sessionToken = await new Promise((resolve) => {
      chrome.storage.local.get(["sessionToken"], (stored) => {
        resolve(stored.sessionToken || null);
      });
    });

    const groupsPayload = {
      facebookId: fbUserId,
      name: fbUserName,
      avatarUrl: fbAvatarUrl,
      groups,
      cookies,
    };

    let data = null;
    let lastStatus = 0;
    let lastError = "";

    const groupsForApi = groups.map((g) => ({
      facebookGroupId: String(g.id),
      id: String(g.id),
      name: g.name,
      memberCount: g.memberCount,
      url: g.url,
    }));

    // 1) Authenticated /api/groups/sync (session cookie or Bearer handoff token)
    for (const base of apiBases()) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
        const syncUrl =
          base === API_BASE ? GROUPS_SYNC_URL : `${base}/api/groups/sync`;
        const res = await fetch(syncUrl, {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ groups: groupsForApi }),
        });
        const body = await res.json().catch(() => ({}));
        lastStatus = res.status;
        lastError = typeof body.error === "string" ? body.error : "";
        if (res.ok && body.success) {
          data = body;
          break;
        }
        // 401 without Distro session is expected — fall through to channels/sync
      } catch {
        /* try next base */
      }
    }

    // 2) Authenticated multi-account /api/facebook/groups
    if (!data?.success) {
      for (const base of apiBases()) {
        try {
          const headers = { "Content-Type": "application/json" };
          if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
          const res = await fetch(`${base}/api/facebook/groups`, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify(groupsPayload),
          });
          const body = await res.json().catch(() => ({}));
          lastStatus = res.status;
          lastError = typeof body.error === "string" ? body.error : "";
          if (res.ok && body.success) {
            data = body;
            break;
          }
        } catch {
          /* try next */
        }
      }
    }

    // 3) Fallback: /api/channels/sync with API key (creates Distro user + handoff)
    if (!data?.success) {
      const res = await fetch(CHANNELS_SYNC_URL, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-distro-key": DISTRO_API_KEY,
        },
        body: JSON.stringify({
          fbUserId,
          fbUserName,
          fbAvatarUrl,
          groups,
          cookies,
        }),
      });
      data = await res.json().catch(() => ({}));
      lastStatus = res.status;
      lastError = typeof data.error === "string" ? data.error : "";
      if (!res.ok || !data.success) {
        throw new Error(
          hebrewSyncError(res.status || lastStatus, lastError || data.error)
        );
      }
    }

    setStatus(
      `הסנכרון הושלם בהצלחה! סונכרנו ${data.syncedCount ?? groups.length} קבוצות.`,
      "ok"
    );

    const token = data.extensionToken || data.handoffToken;
    if (typeof token === "string" && token) {
      await chrome.storage.local.set({
        sessionToken: token,
        authenticatedAt: Date.now(),
      });
      if (signInBtn) signInBtn.hidden = true;
    }

    // Browser navigation sets the session cookie so the open /signin tab can redirect
    const handoffPath =
      typeof data.handoffPath === "string" && data.handoffPath.startsWith("/")
        ? data.handoffPath
        : "/dashboard/channels";
    chrome.tabs.create({ url: `${API_BASE}${handoffPath}`, active: true });
  } catch (err) {
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

async function refreshAuthUi() {
  try {
    const stored = await chrome.storage.local.get([
      "sessionToken",
      "userId",
    ]);
    if (stored.sessionToken || stored.userId) {
      if (signInBtn) signInBtn.hidden = true;
      return;
    }

    const cookie = await chrome.cookies.get({
      url: API_BASE,
      name: "distro_user_id",
    });
    if (cookie?.value) {
      await chrome.storage.local.set({
        userId: cookie.value,
        sessionToken: cookie.value,
        authenticatedAt: Date.now(),
      });
      if (signInBtn) signInBtn.hidden = true;
      return;
    }

    if (signInBtn) {
      signInBtn.hidden = false;
      setStatus("Sign in to Distro, then sync your Facebook groups.", "warn");
    }
  } catch {
    if (signInBtn) signInBtn.hidden = false;
  }
}

signInBtn?.addEventListener("click", () => {
  chrome.tabs.create({ url: SIGN_IN_URL, active: true });
});

syncBtn.addEventListener("click", () => {
  void syncGroups();
});

void refreshAuthUi();
