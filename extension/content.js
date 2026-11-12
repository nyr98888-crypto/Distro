(() => {
  const API_BASE = "https://distro-ecru.vercel.app";
  const SYNC_URL = `${API_BASE}/api/channels/sync`;
  const DISTRO_API_KEY = "zpv9dq136kwfxcn0t285hgoeajmlryi7ub4s";
  const PANEL_ID = "distro-sidebar-container";

  /** @type {File | null} */
  let selectedImageFile = null;
  let composerBound = false;
  /** @type {Set<string>} */
  let selectedGroupIds = new Set();
  /** @type {Array<{id:string,name:string,url?:string}>} */
  let cachedGroups = [];

  const DEFAULT_WA_MESSAGE = "היי, ראיתי את הפוסט שלך ואשמח לפרטים";

  function toWhatsAppInternational(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("972") && digits.length >= 11) return digits;
    if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
    if (digits.length === 9 && digits.startsWith("5")) return `972${digits}`;
    return digits.length >= 10 ? digits : null;
  }

  function buildWhatsAppMeUrl(phone, message) {
    const intl = toWhatsAppInternational(phone);
    if (!intl) return null;
    const text = encodeURIComponent(
      (message || DEFAULT_WA_MESSAGE).trim() || DEFAULT_WA_MESSAGE
    );
    return `https://wa.me/${intl}?text=${text}`;
  }

  function stripWhatsAppFooter(text) {
    return String(text || "")
      .replace(
        /\n*\n💬 ליצירת קשר ישיר בוואטסאפ:\n👉 https:\/\/wa\.me\/[^\s]+/g,
        ""
      )
      .trimEnd();
  }

  function appendWhatsAppLink(text, enabled, phone, message) {
    const base = stripWhatsAppFooter(text);
    if (!enabled) return base;
    const url = buildWhatsAppMeUrl(phone, message);
    if (!url) return base;
    return `${base}\n\n💬 ליצירת קשר ישיר בוואטסאפ:\n👉 ${url}`;
  }

  /**
   * If Facebook's native WhatsApp CTA control is present in the composer
   * modal, click it so the platform attaches its WhatsApp card as well.
   */
  function clickFacebookNativeWhatsAppButton() {
    const labels = [
      "קבל הודעות ב-WhatsApp",
      "קבל הודעות ב‑WhatsApp",
      "Get WhatsApp messages",
      "WhatsApp",
      "וואטסאפ",
    ];
    const nodes = document.querySelectorAll(
      '[role="button"], button, [aria-label], span'
    );
    for (const el of nodes) {
      const aria = el.getAttribute?.("aria-label") || "";
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const hay = `${aria} ${text}`;
      if (
        labels.some((l) => hay.includes(l)) &&
        /whatsapp|וואטסאפ/i.test(hay)
      ) {
        const clickable =
          el.closest('[role="button"]') ||
          (el.tagName === "BUTTON" ? el : null) ||
          el;
        try {
          clickable.click();
          return { ok: true };
        } catch {
          /* continue */
        }
      }
    }
    return { ok: false, error: "Native WhatsApp control not found" };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Load the full joins list — Facebook renders groups lazily on scroll. */
  async function scrollGroupsFeedToEnd() {
    let lastHeight = document.body.scrollHeight;
    let retries = 0;
    let safety = 0;
    const maxPasses = 200;

    while (retries < 4 && safety < maxPasses) {
      safety += 1;
      window.scrollTo(0, document.body.scrollHeight);
      // Also nudge common FB scroll containers (virtualized feeds)
      document
        .querySelectorAll('[role="main"], [data-pagelet], div[style*="overflow"]')
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
      if (newHeight === lastHeight) {
        retries += 1;
      } else {
        retries = 0;
        lastHeight = newHeight;
      }
    }
    window.scrollTo(0, 0);
    await sleep(400);
  }

  function extractFacebookProfile() {
    const cUser = getCookieValue("c_user");
    let name = "";
    let avatarUrl = "";

    const nameSelectors = [
      '[aria-label*="Your profile"]',
      '[aria-label*="הפרופיל שלך"]',
      '[aria-label*="Account"]',
      'a[aria-label][href*="/user/"]',
      'div[role="navigation"] a[href*="/me"]',
      'a[href^="https://www.facebook.com/me"]',
      'a[href*="profile.php"]',
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const aria = (el.getAttribute("aria-label") || "").trim();
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      const candidate = aria || text;
      if (
        candidate &&
        candidate.length >= 2 &&
        candidate.length < 80 &&
        !/facebook|menu|home|home page|דף הבית/i.test(candidate)
      ) {
        // aria often: "Your profile" / "Name's profile"
        name = candidate
          .replace(/'?s profile$/i, "")
          .replace(/^Your profile$/i, "")
          .replace(/^הפרופיל שלך$/i, "")
          .trim();
        if (name && name.length >= 2) break;
        name = text.length >= 2 ? text : name;
        if (name) break;
      }
    }

    // Top-nav avatar image (prefer largest srcset candidate)
    const avatarCandidates = Array.from(
      document.querySelectorAll(
        'div[role="banner"] image, div[role="banner"] img, div[role="navigation"] img, [aria-label*="profile" i] img, [aria-label*="פרופיל"] img, svg image'
      )
    );
    for (const node of avatarCandidates) {
      let src = "";
      if (node.tagName === "IMAGE" || node.tagName === "image") {
        src =
          node.getAttribute("xlink:href") ||
          node.getAttribute("href") ||
          "";
      } else {
        src = node.currentSrc || node.src || node.getAttribute("src") || "";
        const srcset = node.getAttribute("srcset") || "";
        if (srcset) {
          const parts = srcset.split(",").map((p) => p.trim().split(/\s+/)[0]);
          if (parts.length) src = parts[parts.length - 1] || src;
        }
      }
      if (
        src &&
        /scontent|fbcdn|facebook\.com\/.*\/picture|graph\.facebook/i.test(src)
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

  function scrapeFacebookGroupsFromDom() {
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
      /פעילות אחרונה|פוסטים חדשים|Last active|Active now|New posts?|members?|חברים|תויגו על ידי|לא נקראו/i.test(
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
      (() => {
        let node = anchor.parentElement;
        for (let i = 0; i < 6 && node; i += 1) {
          if (/(?:members?|חברים)/i.test(node.textContent || "")) return node;
          node = node.parentElement;
        }
        return anchor.parentElement?.parentElement || anchor.parentElement;
      })();

    const extractGroupName = (anchor, card) => {
      const candidates = [];
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
      if (!id || !/^\d{5,}$/.test(String(id))) return;
      const cleanName = cleanGroupName(name);
      if (!cleanName || cleanName.length < 2) return;
      if (/תויגו על ידי|לא נקראו|כולם תויגו/i.test(cleanName)) return;
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
        bestName = cleanName;
      } else if (nameLooksNoisy(prev.name) && cleanName.length >= 2) {
        bestName = cleanName;
      }
      byId.set(id, {
        ...prev,
        name: bestName,
        memberCount: nextCount && nextCount > 0 ? nextCount : prev.memberCount,
        url: prev.url || url || `https://www.facebook.com/groups/${id}`,
      });
    };

    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const href = a.href || a.getAttribute("href") || "";
      const m = href.match(/\/groups\/(\d+)/);
      if (!m) return;
      if (/\/groups\/\d+\/(user|members|permalink)/i.test(href)) return;
      const id = m[1];
      const card = findCard(a);
      addGroup(id, extractGroupName(a, card), findMemberCount(card), href.split("?")[0]);
    });

    // Also accept vanity /groups/<slug> links that embed numeric id in data attrs
    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const href = a.href || a.getAttribute("href") || "";
      if (/\/groups\/(\d+)/.test(href)) return;
      const card = findCard(a);
      const dataId =
        a.getAttribute("data-id") ||
        card?.getAttribute?.("data-id") ||
        "";
      const m = String(dataId).match(/(\d{5,})/);
      if (!m) return;
      addGroup(
        m[1],
        extractGroupName(a, card),
        findMemberCount(card),
        href.split("?")[0]
      );
    });

    return {
      groups: Array.from(byId.values()),
      pageUrl: location.href,
    };
  }

  /** Full sync scrape: infinite-scroll joins feed, then collect all groups + profile. */
  async function scrapeFacebookGroups() {
    const onJoins = /\/groups\/joins/i.test(location.href);
    if (onJoins) {
      await scrollGroupsFeedToEnd();
    }
    const profile = extractFacebookProfile();
    const scraped = scrapeFacebookGroupsFromDom();
    return {
      groups: scraped.groups,
      fbUserName: profile.name,
      fbAvatarUrl: profile.avatarUrl,
      fbProfile: profile,
      pageUrl: scraped.pageUrl || location.href,
    };
  }

  function readDocumentCookies() {
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=");
        if (eq < 0) return null;
        return {
          name: part.slice(0, eq),
          value: decodeURIComponent(part.slice(eq + 1)),
          domain: ".facebook.com",
          path: "/",
        };
      })
      .filter(Boolean);
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

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Read failed"));
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToFile(dataUrl, name, type) {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) throw new Error("Invalid data URL");
    const b64 = dataUrl.slice(comma + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || "image.jpg", {
      type: type || "image/jpeg",
    });
  }

  /**
   * Method A — dispatch a File onto Facebook's composer file input.
   * Call after the create-post dialog (and photo picker) is open.
   */
  function attachImageToFacebookComposer(file) {
    const candidates = Array.from(
      document.querySelectorAll('input[type="file"]')
    ).filter((input) => {
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      return !accept || accept.includes("image") || accept.includes("*/*");
    });

    const fbFileInput = candidates[candidates.length - 1];
    if (!fbFileInput) {
      return { ok: false, error: "Facebook file input not found" };
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fbFileInput.files = dataTransfer.files;
    fbFileInput.dispatchEvent(new Event("input", { bubbles: true }));
    fbFileInput.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  function updatePublishLabel() {
    const publishBtn = document.getElementById("distro-publish-btn");
    const timingDrawer = document.getElementById("distro-timing-drawer");
    const scheduleTimeInput = document.getElementById("distro-schedule-time");
    if (!publishBtn || !timingDrawer || !scheduleTimeInput) return;

    const timingOpen = timingDrawer.classList.contains("is-open");
    if (timingOpen || scheduleTimeInput.value) {
      publishBtn.textContent = "תזמן פוסטים לקבוצות";
    } else {
      publishBtn.textContent = "פרסם לפייסבוק";
    }
  }

  function updateAudienceBadge() {
    const countEl = document.getElementById("target-groups-count");
    if (!countEl) return;
    const n = selectedGroupIds.size;
    countEl.textContent =
      n > 0 ? `${n} קבוצות נבחרות` : "קבוצות נבחרות";
  }

  function renderGroupPicker() {
    const list = document.getElementById("distro-groups-list");
    const empty = document.getElementById("distro-groups-empty");
    if (!list) return;

    list.innerHTML = "";
    if (!cachedGroups.length) {
      if (empty) empty.style.display = "block";
      return;
    }
    if (empty) empty.style.display = "none";

    cachedGroups.forEach((group) => {
      const row = document.createElement("label");
      row.className = "distro-group-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = group.id;
      cb.checked = selectedGroupIds.has(group.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedGroupIds.add(group.id);
        else selectedGroupIds.delete(group.id);
        updateAudienceBadge();
      });
      const name = document.createElement("span");
      name.textContent = group.name;
      row.appendChild(cb);
      row.appendChild(name);
      list.appendChild(row);
    });
    updateAudienceBadge();
  }

  function loadCachedGroups() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["syncedGroups"], (stored) => {
        cachedGroups = Array.isArray(stored.syncedGroups)
          ? stored.syncedGroups
          : [];
        if (selectedGroupIds.size === 0) {
          selectedGroupIds = new Set(cachedGroups.map((g) => g.id));
        }
        renderGroupPicker();
        resolve(cachedGroups);
      });
    });
  }

  async function urlToFile(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Image fetch failed");
    const blob = await res.blob();
    const type = blob.type || "image/jpeg";
    const ext = (type.split("/")[1] || "jpg").split(";")[0];
    return new File([blob], `repost.${ext}`, { type });
  }

  async function prefillComposer({ text, imageUrl, imageDataUrl }) {
    const panel = ensurePanel();
    panel.style.display = "block";
    await loadCachedGroups();

    const postTextArea = panel.querySelector("#distro-post-text");
    const previewBox = panel.querySelector("#distro-media-preview-box");
    const previewImg = panel.querySelector("#distro-media-img");
    const fileInput = panel.querySelector("#distro-image-file");

    if (postTextArea) {
      postTextArea.value = text || "";
      postTextArea.focus();
    }

    selectedImageFile = null;
    if (previewBox) previewBox.classList.remove("is-visible");
    if (previewImg) previewImg.removeAttribute("src");
    if (fileInput) fileInput.value = "";

    try {
      if (imageDataUrl) {
        selectedImageFile = dataUrlToFile(imageDataUrl, "repost.jpg", "image/jpeg");
      } else if (imageUrl) {
        selectedImageFile = await urlToFile(imageUrl);
      }
      if (selectedImageFile && previewBox && previewImg) {
        const dataUrl = await fileToDataUrl(selectedImageFile);
        previewImg.src = dataUrl;
        previewBox.classList.add("is-visible");
      }
      setComposerFeedback("הפוסט יובא — בחרו קבוצות ותזמון", "ok");
    } catch {
      setComposerFeedback("הטקסט יובא, אך טעינת התמונה נכשלה", "err");
    }
  }

  function extractPostFromArticle(article) {
    if (!article) return { text: "", imageUrl: null };

    const messageSelectors = [
      '[data-ad-preview="message"]',
      '[data-ad-comet-preview="message"]',
      '[data-ad-rendering-role="story_message"]',
      'div[dir="auto"][style*="text-align"]',
    ];
    let text = "";
    for (const sel of messageSelectors) {
      const node = article.querySelector(sel);
      const candidate = (node?.innerText || node?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (candidate.length > text.length) text = candidate;
    }
    if (!text) {
      const blocks = article.querySelectorAll('div[dir="auto"]');
      for (const el of blocks) {
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (t.length > 20 && t.length > text.length && t.length < 4000) {
          text = t;
        }
      }
    }

    let imageUrl = null;
    const imgs = Array.from(article.querySelectorAll("img")).filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src || src.startsWith("data:")) return false;
      if (/emoji|static\.xx\.fbcdn|rsrc\.php|\/images\/emoji/i.test(src)) {
        return false;
      }
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w && h && (w < 80 || h < 80)) return false;
      return /scontent|fbcdn|facebook\.com\/.*\/t|external/i.test(src);
    });
    if (imgs.length) {
      imgs.sort(
        (a, b) =>
          (b.naturalWidth || b.width || 0) * (b.naturalHeight || b.height || 0) -
          (a.naturalWidth || a.width || 0) * (a.naturalHeight || a.height || 0)
      );
      imageUrl = imgs[0].currentSrc || imgs[0].src;
    }

    return { text, imageUrl };
  }

  function isOwnProfileContext() {
    const path = location.pathname || "";
    if (path === "/me" || path.startsWith("/me/") || path.startsWith("/profile.php")) {
      return true;
    }
    const userId = getCookieValue("c_user");
    if (userId && path.includes(userId)) return true;
    return false;
  }

  function articleLooksEditable(article) {
    const labels = Array.from(
      article.querySelectorAll("[aria-label], [aria-haspopup]")
    )
      .map((el) => el.getAttribute("aria-label") || "")
      .join(" ");
    return /Edit|עריכה|Delete|מחיק|Actions for your post|פעולות לפוסט שלך/i.test(
      labels
    );
  }

  function findActionBar(article) {
    const toolbars = article.querySelectorAll('[role="toolbar"]');
    for (const bar of toolbars) {
      const t = bar.textContent || "";
      if (/Like|Comment|Share|אהב|תגוב|שיתוף|שתפ/i.test(t)) return bar;
    }
    const buttons = article.querySelectorAll('[role="button"]');
    for (const btn of buttons) {
      const label = `${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""}`;
      if (/^(Like|אהבתי|Comment|תגובה|Share|שיתוף)/i.test(label.trim())) {
        return (
          btn.closest('[role="toolbar"]') ||
          btn.parentElement?.parentElement ||
          btn.parentElement
        );
      }
    }
    return null;
  }

  function injectRedistributeButtons() {
    const articles = document.querySelectorAll('[role="article"]');
    articles.forEach((article) => {
      if (article.querySelector(".distro-repost-btn")) return;
      const allow =
        isOwnProfileContext() || articleLooksEditable(article);
      if (!allow) return;

      const actionBar = findActionBar(article);
      if (!actionBar) return;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "distro-repost-btn";
      btn.title = "הפץ עם DISTRO";
      btn.innerHTML =
        '<span aria-hidden="true">↗</span><span>הפץ עם DISTRO</span>';
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const extracted = extractPostFromArticle(article);
        if (!extracted.text && !extracted.imageUrl) {
          setComposerFeedback("לא הצלחנו לחלץ תוכן מהפוסט", "err");
          ensurePanel().style.display = "block";
          return;
        }
        void prefillComposer(extracted);
      });

      actionBar.appendChild(btn);
    });
  }

  function setComposerFeedback(message, tone) {
    const el = document.getElementById("distro-composer-feedback");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("is-ok", "is-err");
    if (tone === "ok") el.classList.add("is-ok");
    if (tone === "err") el.classList.add("is-err");
  }

  function bindComposer(panel) {
    if (composerBound) return;
    const fileInput = panel.querySelector("#distro-image-file");
    const previewBox = panel.querySelector("#distro-media-preview-box");
    const previewImg = panel.querySelector("#distro-media-img");
    const removeMediaBtn = panel.querySelector("#distro-remove-media");
    const toggleTimingBtn = panel.querySelector("#distro-toggle-timing");
    const timingDrawer = panel.querySelector("#distro-timing-drawer");
    const toggleWhatsAppBtn = panel.querySelector("#distro-toggle-whatsapp");
    const whatsappDrawer = panel.querySelector("#distro-whatsapp-drawer");
    const waEnabled = panel.querySelector("#distro-wa-enabled");
    const waPhone = panel.querySelector("#distro-wa-phone");
    const waMessage = panel.querySelector("#distro-wa-message");
    const publishBtn = panel.querySelector("#distro-publish-btn");
    const scheduleTimeInput = panel.querySelector("#distro-schedule-time");
    const intervalDelaySelect = panel.querySelector("#distro-interval-delay");
    const postTextArea = panel.querySelector("#distro-post-text");

    if (
      !fileInput ||
      !previewBox ||
      !previewImg ||
      !removeMediaBtn ||
      !toggleTimingBtn ||
      !timingDrawer ||
      !toggleWhatsAppBtn ||
      !whatsappDrawer ||
      !waEnabled ||
      !waPhone ||
      !waMessage ||
      !publishBtn ||
      !scheduleTimeInput ||
      !intervalDelaySelect ||
      !postTextArea
    ) {
      return;
    }

    composerBound = true;

    chrome.storage.local.get(["whatsappPhone"], (stored) => {
      if (typeof stored.whatsappPhone === "string" && stored.whatsappPhone) {
        waPhone.value = stored.whatsappPhone;
      }
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setComposerFeedback("נא לבחור קובץ תמונה בלבד", "err");
        fileInput.value = "";
        return;
      }
      selectedImageFile = file;
      try {
        const dataUrl = await fileToDataUrl(file);
        previewImg.src = dataUrl;
        previewBox.classList.add("is-visible");
        setComposerFeedback("");
      } catch {
        selectedImageFile = null;
        setComposerFeedback("טעינת התמונה נכשלה", "err");
      }
    });

    removeMediaBtn.addEventListener("click", () => {
      selectedImageFile = null;
      fileInput.value = "";
      previewImg.removeAttribute("src");
      previewBox.classList.remove("is-visible");
    });

    toggleTimingBtn.addEventListener("click", () => {
      timingDrawer.classList.toggle("is-open");
      toggleTimingBtn.classList.toggle(
        "is-active",
        timingDrawer.classList.contains("is-open")
      );
      updatePublishLabel();
    });

    toggleWhatsAppBtn.addEventListener("click", () => {
      const opening = !whatsappDrawer.classList.contains("is-open");
      whatsappDrawer.classList.toggle("is-open", opening);
      toggleWhatsAppBtn.classList.toggle("is-active", opening);
      if (opening) {
        waEnabled.checked = true;
      }
    });

    waPhone.addEventListener("change", () => {
      chrome.storage.local.set({ whatsappPhone: waPhone.value.trim() });
    });

    scheduleTimeInput.addEventListener("change", updatePublishLabel);

    publishBtn.addEventListener("click", async () => {
      const postText = postTextArea.value.trim();
      const scheduledTime = scheduleTimeInput.value || null;
      const delaySeconds = parseInt(intervalDelaySelect.value, 10) || 60;
      const whatsappEnabled = Boolean(waEnabled.checked);
      const whatsappPhone = waPhone.value.trim();
      const whatsappMessage =
        waMessage.value.trim() || DEFAULT_WA_MESSAGE;

      if (!postText && !selectedImageFile) {
        setComposerFeedback("נא להוסיף תוכן טקסט או תמונה לפני הפרסום", "err");
        return;
      }
      if (cachedGroups.length > 0 && selectedGroupIds.size === 0) {
        setComposerFeedback("נא לבחור לפחות קבוצה אחת", "err");
        return;
      }
      if (whatsappEnabled && !buildWhatsAppMeUrl(whatsappPhone, whatsappMessage)) {
        setComposerFeedback("נא להזין מספר וואטסאפ תקין (05X-XXXXXXX)", "err");
        return;
      }

      publishBtn.disabled = true;
      setComposerFeedback("שולח לתור הפרסום…");

      try {
        let imageDataUrl = null;
        let imageName = null;
        let imageType = null;
        if (selectedImageFile) {
          imageDataUrl = await fileToDataUrl(selectedImageFile);
          imageName = selectedImageFile.name;
          imageType = selectedImageFile.type;
        }

        const finalText = appendWhatsAppLink(
          postText,
          whatsappEnabled,
          whatsappPhone,
          whatsappMessage
        );
        const whatsappUrl = whatsappEnabled
          ? buildWhatsAppMeUrl(whatsappPhone, whatsappMessage)
          : null;

        if (whatsappPhone) {
          chrome.storage.local.set({ whatsappPhone });
        }

        // Best-effort: attach Facebook's native WhatsApp card if available.
        if (whatsappEnabled) {
          clickFacebookNativeWhatsAppButton();
        }

        // File objects cannot cross chrome.runtime — send serializable media.
        const postPayload = {
          text: finalText,
          imageDataUrl,
          imageName,
          imageType,
          scheduledFor: scheduledTime,
          delaySeconds,
          groupIds: Array.from(selectedGroupIds),
          groups: cachedGroups.filter((g) => selectedGroupIds.has(g.id)),
          whatsapp: whatsappEnabled
            ? {
                phone: whatsappPhone,
                message: whatsappMessage,
                url: whatsappUrl,
              }
            : null,
          createdAt: Date.now(),
        };

        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { action: "START_POSTING_QUEUE", data: postPayload },
            (res) => {
              if (chrome.runtime.lastError) {
                resolve({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
                return;
              }
              resolve(res || { success: false, error: "No response" });
            }
          );
        });

        if (!response?.success) {
          throw new Error(response?.error || "שליחה לתור נכשלה");
        }

        setComposerFeedback("הפוסט נשלח לתור הפרסום בהצלחה", "ok");
      } catch (err) {
        setComposerFeedback(
          err instanceof Error ? err.message : "שליחה לתור נכשלה",
          "err"
        );
      } finally {
        publishBtn.disabled = false;
      }
    });
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      bindComposer(panel);
      void loadCachedGroups();
      return panel;
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.setAttribute("dir", "rtl");
    panel.style.cssText = [
      "position:fixed",
      "top:72px",
      "right:16px",
      "z-index:2147483646",
      "width:380px",
      "max-height:calc(100vh - 96px)",
      "overflow:auto",
      "background:#0f172a",
      "color:#f8fafc",
      "border:1px solid #334155",
      "border-radius:12px",
      "box-shadow:0 12px 40px rgba(0,0,0,.35)",
      "font-family:system-ui,-apple-system,sans-serif",
      "padding:16px",
      "display:none",
    ].join(";");

    panel.innerHTML = `
      <div class="distro-panel-chrome">
        <strong class="distro-panel-title">DISTRO</strong>
        <button type="button" id="distro-close-btn" class="distro-close-btn" aria-label="Close">×</button>
      </div>

      <div class="distro-sync-block">
        <p class="distro-sync-hint">
          Sync joined Facebook groups into your Distro dashboard.
        </p>
        <button type="button" id="distro-sync-btn" class="distro-sync-btn">
          Sync Groups
        </button>
        <div id="distro-status" class="distro-status"></div>
      </div>

      <div class="distro-composer-card">
        <div class="composer-header">
          <h3>יצירת פוסט חדש</h3>
        </div>

        <div class="composer-user-row">
          <div class="composer-avatar" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#a8b3cf"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </div>
          <div class="composer-user-meta">
            <span class="composer-username">DISTRO Auto-Poster</span>
            <div class="audience-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              <span id="target-groups-count">קבוצות נבחרות</span>
            </div>
          </div>
        </div>

        <div class="composer-body">
          <textarea
            id="distro-post-text"
            placeholder="על מה אתה רוצה לספר לחברי הקבוצות?"
            rows="4"
          ></textarea>
          <div id="distro-media-preview-box" class="media-preview-box">
            <button type="button" id="distro-remove-media" class="remove-btn" title="הסר תמונה">✕</button>
            <img id="distro-media-img" alt="תצוגה מקדימה" />
          </div>
        </div>

        <div class="composer-attachment-bar">
          <span class="attachment-label">הוסף לפוסט שלך</span>
          <div class="attachment-actions">
            <label class="attachment-btn" title="תמונה / מדיה">
              <input type="file" id="distro-image-file" accept="image/*" style="display:none;" />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#45bd62"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            </label>
            <button type="button" id="distro-toggle-timing" class="attachment-btn" title="תזמון וזמני השהייה">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877f2"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            </button>
            <button type="button" id="distro-toggle-whatsapp" class="attachment-btn" title="קישור לוואטסאפ">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </button>
          </div>
        </div>

        <div id="distro-timing-drawer" class="timing-drawer">
          <div class="timing-field-group">
            <label for="distro-schedule-time">התחל פרסום ב:</label>
            <input type="datetime-local" id="distro-schedule-time" />
          </div>
          <div class="timing-field-group">
            <label for="distro-interval-delay">השהייה בין קבוצות (מונע חסימות):</label>
            <select id="distro-interval-delay">
              <option value="30">30 שניות</option>
              <option value="60" selected>דקה (מומלץ)</option>
              <option value="120">2 דקות</option>
              <option value="300">5 דקות</option>
            </select>
          </div>
        </div>

        <div id="distro-whatsapp-drawer" class="whatsapp-drawer">
          <label class="whatsapp-check">
            <input type="checkbox" id="distro-wa-enabled" checked />
            <span>צרף קישור ישיר לוואטסאפ שלי</span>
          </label>
          <div class="timing-field-group">
            <label for="distro-wa-phone">מספר טלפון (ישראל)</label>
            <input type="tel" id="distro-wa-phone" dir="ltr" placeholder="05X-XXXXXXX" />
          </div>
          <div class="timing-field-group">
            <label for="distro-wa-message">הודעת פתיחה</label>
            <input type="text" id="distro-wa-message" value="היי, ראיתי את הפוסט שלך ואשמח לפרטים" />
          </div>
        </div>

        <div class="distro-groups-block">
          <div class="distro-groups-header">
            <span>קבוצות יעד</span>
            <button type="button" id="distro-groups-select-all">בחר הכל</button>
          </div>
          <div id="distro-groups-list" class="distro-groups-list"></div>
          <div id="distro-groups-empty" class="distro-groups-empty">
            סנכרנו קבוצות קודם (Sync Groups) כדי לבחור יעדים.
          </div>
        </div>

        <button type="button" id="distro-publish-btn" class="publish-button">
          פרסם לפייסבוק
        </button>
        <div id="distro-composer-feedback" class="composer-feedback"></div>
      </div>
    `;

    document.documentElement.appendChild(panel);

    panel.querySelector("#distro-close-btn")?.addEventListener("click", () => {
      panel.style.display = "none";
    });
    panel.querySelector("#distro-sync-btn")?.addEventListener("click", () => {
      void runSync();
    });
    panel
      .querySelector("#distro-groups-select-all")
      ?.addEventListener("click", () => {
        selectedGroupIds = new Set(cachedGroups.map((g) => g.id));
        renderGroupPicker();
      });

    bindComposer(panel);
    void loadCachedGroups();
    return panel;
  }

  function setStatus(message, tone) {
    const el = document.getElementById("distro-status");
    if (!el) return;
    el.textContent = message;
    el.style.color =
      tone === "ok" ? "#34d399" : tone === "err" ? "#f87171" : "#fbbf24";
  }

  function togglePanel() {
    const panel = ensurePanel();
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  }

  async function runSync() {
    const btn = document.getElementById("distro-sync-btn");
    if (btn) btn.disabled = true;
    try {
      const fbUserId = getCookieValue("c_user");
      if (!fbUserId) {
        setStatus("Not logged into Facebook. Sign in, then sync again.", "err");
        return;
      }

      if (!/\/groups\/joins/i.test(location.href)) {
        setStatus("Opening your groups list…", "warn");
        location.href = "https://www.facebook.com/groups/joins/";
        return;
      }

      setStatus("Scrolling to load all groups…", "warn");
      const scraped = await scrapeFacebookGroups();
      const groups = scraped.groups || [];
      if (!groups.length) {
        setStatus(
          "No groups found after full scroll. Refresh the joins page and try again.",
          "err"
        );
        return;
      }

      setStatus(`Found ${groups.length} groups — sending to Distro…`, "warn");

      const fbUserName = scraped.fbUserName || scraped.fbProfile?.name || "Facebook User";
      const fbAvatarUrl =
        scraped.fbAvatarUrl ||
        scraped.fbProfile?.avatarUrl ||
        `https://graph.facebook.com/${fbUserId}/picture?type=large`;
      const fbProfile = {
        facebookId: fbUserId,
        name: fbUserName,
        avatarUrl: fbAvatarUrl,
        isConnected: true,
        syncedAt: Date.now(),
      };
      chrome.storage.local.set({
        fbProfile,
        awaitingFbLogin: false,
        syncedGroups: groups.map((g) => ({
          id: String(g.id),
          name: g.name,
          url: g.url,
        })),
      });

      const payload = {
        facebookId: fbUserId,
        name: fbUserName,
        avatarUrl: fbAvatarUrl,
        groups,
        cookies: readDocumentCookies(),
      };

      // Prefer authenticated /api/facebook/groups via background (session token)
      const viaBg = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(
            { type: "SYNC_GROUPS_TO_SERVER", payload },
            (response) => {
              void chrome.runtime.lastError;
              resolve(response || null);
            }
          );
        } catch {
          resolve(null);
        }
      });

      let data = viaBg;
      if (!data?.success) {
        const res = await fetch(SYNC_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-distro-key": DISTRO_API_KEY,
          },
          body: JSON.stringify({
            fbUserId,
            fbUserName,
            fbAvatarUrl,
            groups,
            cookies: readDocumentCookies(),
          }),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(
            data.error || viaBg?.error || `Server error (${res.status})`
          );
        }
      }

      const token = data.extensionToken || data.handoffToken;
      if (typeof token === "string" && token) {
        chrome.runtime.sendMessage({ type: "AUTH_SUCCESS", token });
      }

      try {
        chrome.runtime.sendMessage(
          { type: "ACCOUNT_SWITCHED", account: { id: data.accountId } },
          () => void chrome.runtime.lastError
        );
      } catch {
        /* ignore */
      }

      cachedGroups = groups.map((g) => ({
        id: String(g.id),
        name: g.name,
        url: g.url,
      }));
      selectedGroupIds = new Set(cachedGroups.map((g) => g.id));
      chrome.storage.local.set({ syncedGroups: cachedGroups });
      renderGroupPicker();

      const countEl = document.getElementById("target-groups-count");
      if (countEl) {
        countEl.textContent = `${data.syncedCount ?? groups.length} קבוצות`;
      }

      setStatus(
        `Synced ${data.syncedCount ?? groups.length} groups successfully.`,
        "ok"
      );

      const handoffPath =
        typeof data.handoffPath === "string" && data.handoffPath.startsWith("/")
          ? data.handoffPath
          : "/dashboard/channels";
      window.open(`${API_BASE}${handoffPath}`, "_blank", "noopener");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sync failed. Please try again.";
      setStatus(message, "err");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action === "TOGGLE_DISTRO_SIDEBAR") {
      togglePanel();
      sendResponse({ ok: true });
      return true;
    }
    if (request?.action === "RUN_DISTRO_SYNC") {
      void runSync().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (
      request?.action === "GET_FACEBOOK_PROFILE" ||
      request?.type === "GET_FACEBOOK_PROFILE"
    ) {
      const profile = extractFacebookProfile();
      sendResponse({
        ok: true,
        profile: {
          ...profile,
          isConnected: Boolean(profile?.facebookId || getCookieValue("c_user")),
        },
      });
      return true;
    }
    if (request?.action === "ATTACH_IMAGE_TO_COMPOSER") {
      try {
        const file =
          request.file ||
          (request.imageDataUrl
            ? dataUrlToFile(
                request.imageDataUrl,
                request.imageName || "image.jpg",
                request.imageType || "image/jpeg"
              )
            : null);
        if (!file) {
          sendResponse({ ok: false, error: "No image provided" });
          return true;
        }
        sendResponse(attachImageToFacebookComposer(file));
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Attach failed",
        });
      }
      return true;
    }
    if (request?.action === "EXECUTE_SCHEDULED_POST" && request.post) {
      void executeScheduledPost(request.post)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "Execute failed",
          })
        );
      return true;
    }
    if (request?.action === "EXECUTE_LIVE_UPDATE" && request.job) {
      void executeLiveUpdate(request.job)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : "Live update failed",
          })
        );
      return true;
    }
    return false;
  });

  function softNavigate(url) {
    history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function snippetMatch(haystack, needle) {
    if (!needle) return true;
    const a = String(haystack || "").replace(/\s+/g, " ").trim();
    const b = String(needle || "").replace(/\s+/g, " ").trim().slice(0, 48);
    if (!b) return true;
    return a.includes(b);
  }

  function extractFbIdFromUrl(url) {
    if (!url) return "";
    const m =
      /(?:posts\/|permalink\/|multi_permalinks=|story_fbid=|pfbid)([A-Za-z0-9_-]+)/i.exec(
        url
      );
    return m?.[1] || "";
  }

  async function capturePostPermalink(contentHint) {
    await sleep(900);
    const anchors = Array.from(
      document.querySelectorAll('a[href*="/posts/"], a[href*="permalink"], a[href*="multi_permalinks"], a[href*="story_fbid"]')
    );
    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      if (!href || /comment_id|reply_comment/i.test(href)) continue;
      const article = a.closest('[role="article"]');
      const text = article?.innerText || "";
      if (article && contentHint && !snippetMatch(text, contentHint)) continue;
      try {
        const abs = new URL(href, location.origin).toString().split("?")[0];
        return abs;
      } catch {
        return href;
      }
    }
    return "";
  }

  function findMenuButtonNear(root) {
    const scope = root || document;
    const buttons = Array.from(
      scope.querySelectorAll('[role="button"], [aria-haspopup="menu"]')
    );
    return (
      buttons.find((el) =>
        /Actions for this post|More|אפשרויות נוספות|פעולות עבור הפוסט|תפריט/i.test(
          `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`
        )
      ) ||
      buttons.find((el) =>
        (el.getAttribute("aria-label") || "").includes("…")
      ) ||
      null
    );
  }

  function findMenuitem(labelRe) {
    return Array.from(
      document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], span')
    ).find((el) => labelRe.test((el.textContent || "").trim()));
  }

  async function openPostActionsMenu() {
    const article =
      document.querySelector('[role="article"]') || document.body;
    const menuBtn = findMenuButtonNear(article);
    if (!menuBtn) return false;
    (menuBtn.closest('[role="button"]') || menuBtn).click();
    await sleep(700);
    return true;
  }

  async function editLivePostText(newText) {
    const opened = await openPostActionsMenu();
    if (!opened) return { ok: false, error: "Post menu not found" };

    const editItem = findMenuitem(/^(Edit post|ערוך פוסט|Edit)$/i);
    if (!editItem) {
      return { ok: false, error: "Edit post option not found" };
    }
    (editItem.closest('[role="menuitem"]') || editItem).click();
    await sleep(900);

    const textbox =
      document.querySelector('div[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"][role="textbox"]');
    if (!textbox) return { ok: false, error: "Edit textbox not found" };

    textbox.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, newText || "");
    textbox.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await sleep(400);

    const saveBtn = Array.from(
      document.querySelectorAll('[role="button"], button')
    ).find((el) =>
      /^(Save|Done|שמור|סיום|שמירה)$/i.test(
        (el.getAttribute("aria-label") || el.textContent || "").trim()
      )
    );
    if (!saveBtn) return { ok: false, error: "Save button not found" };
    saveBtn.click();
    await sleep(1200);
    return { ok: true };
  }

  async function deleteLivePost() {
    const opened = await openPostActionsMenu();
    if (!opened) return { ok: false, error: "Post menu not found" };

    const deleteItem = findMenuitem(
      /^(Delete|Delete post|מחק|מחק פוסט|Move to trash|העבר לאשפה)$/i
    );
    if (!deleteItem) {
      return { ok: false, error: "Delete option not found" };
    }
    (deleteItem.closest('[role="menuitem"]') || deleteItem).click();
    await sleep(700);

    const confirmBtn = Array.from(
      document.querySelectorAll('[role="button"], button')
    ).find((el) =>
      /^(Delete|Confirm|מחק|אישור|Remove)$/i.test(
        (el.getAttribute("aria-label") || el.textContent || "").trim()
      )
    );
    if (confirmBtn) {
      confirmBtn.click();
      await sleep(1200);
    }
    return { ok: true };
  }

  async function fillComposerAndPublish(text, imageFile) {
    // Open Facebook's create-post entry if present
    const starters = Array.from(
      document.querySelectorAll('[role="button"], span')
    ).filter((el) =>
      /What's on your mind|במה אתה חושב|צור פוסט|Create post|כתוב משהו/i.test(
        `${el.getAttribute("aria-label") || ""} ${el.textContent || ""}`
      )
    );
    if (starters[0]) {
      (starters[0].closest('[role="button"]') || starters[0]).click();
      await sleep(800);
    }

    const textbox =
      document.querySelector(
        'div[role="textbox"][contenteditable="true"]'
      ) ||
      document.querySelector('[contenteditable="true"][role="textbox"]');
    if (textbox && text) {
      textbox.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, text);
      textbox.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    if (imageFile) {
      attachImageToFacebookComposer(imageFile);
      await sleep(600);
    }

    if (/\n💬 ליצירת קשר ישיר בוואטסאפ:/.test(text || "")) {
      clickFacebookNativeWhatsAppButton();
      await sleep(400);
    }

    const publishCandidates = Array.from(
      document.querySelectorAll('[role="button"], button')
    ).filter((el) =>
      /^(Post|Publish|פרסם|פרסום)$/i.test(
        (el.getAttribute("aria-label") || el.textContent || "").trim()
      )
    );
    if (publishCandidates[0]) {
      publishCandidates[0].click();
      await sleep(1200);
      const postUrl = await capturePostPermalink(text);
      return { ok: true, postUrl };
    }
    return { ok: false, error: "Publish button not found" };
  }

  async function executeScheduledPost(post) {
    const groups = Array.isArray(post.targetGroups) ? post.targetGroups : [];
    const delayMs = Math.max(5, Number(post.delaySeconds) || 60) * 1000;
    let imageFile = null;
    const imageSrc = post.imageDataUrl || post.imageUrl || "";
    if (imageSrc.startsWith("data:")) {
      try {
        imageFile = dataUrlToFile(
          imageSrc,
          post.imageName || "sched.jpg",
          post.imageType || "image/jpeg"
        );
      } catch {
        imageFile = null;
      }
    }

    ensurePanel().style.display = "block";
    setComposerFeedback("מריץ תזמון מתוזמן…", "warn");

    const groupResults = [];

    if (!groups.length) {
      const result = await fillComposerAndPublish(post.content || "", imageFile);
      return result;
    }

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      const url =
        group.url ||
        (group.externalId
          ? `https://www.facebook.com/groups/${group.externalId}`
          : null);
      if (url && !location.href.includes(String(group.externalId || ""))) {
        softNavigate(url);
        await sleep(2000);
      }

      setComposerFeedback(
        `מפרסם לקבוצה ${i + 1}/${groups.length}: ${group.name || group.id}`,
        "warn"
      );
      const result = await fillComposerAndPublish(post.content || "", imageFile);
      if (!result.ok) {
        return {
          ok: false,
          error: result.error || `Failed on group ${group.name || group.id}`,
          groupResults,
        };
      }
      if (result.postUrl) {
        groupResults.push({
          groupId: group.id || "",
          groupName: group.name || "",
          groupExternalId: group.externalId || "",
          postUrl: result.postUrl,
          postFbId: extractFbIdFromUrl(result.postUrl),
          status: "live",
        });
      }
      if (i < groups.length - 1) await sleep(delayMs);
    }

    setComposerFeedback("התזמון הושלם", "ok");
    return { ok: true, postedTo: groups.length, groupResults };
  }

  async function executeLiveUpdate(job) {
    const targets = Array.isArray(job?.targets) ? job.targets : [];
    const delayMs = Math.max(5, Number(job?.delaySeconds) || 60) * 1000;
    const mode = job?.mode || "text";
    const content = job?.content || "";

    ensurePanel().style.display = "block";
    setComposerFeedback(
      mode === "text"
        ? "מעדכן טקסט בפוסטים חיים…"
        : "מוחק ומפרסם מחדש עם תמונות…",
      "warn"
    );

    let imageFile = null;
    if (mode === "replace_repost") {
      const imageSrc = job.imageUrl || "";
      if (imageSrc.startsWith("data:")) {
        try {
          imageFile = dataUrlToFile(imageSrc, "repost.jpg", "image/jpeg");
        } catch {
          imageFile = null;
        }
      }
    }

    const groupResults = [];

    for (let i = 0; i < targets.length; i += 1) {
      const target = targets[i];
      if (!target.postUrl) continue;

      setComposerFeedback(
        `מעדכן ${i + 1}/${targets.length}: ${target.groupName || target.groupId}`,
        "warn"
      );

      softNavigate(target.postUrl);
      await sleep(2200);

      if (mode === "text") {
        const edited = await editLivePostText(content);
        if (!edited.ok) {
          return {
            ok: false,
            error:
              edited.error ||
              `Edit failed on ${target.groupName || target.postUrl}`,
            groupResults,
          };
        }
        groupResults.push({
          ...target,
          postUrl: target.postUrl,
          status: "updated",
        });
      } else {
        const deleted = await deleteLivePost();
        if (!deleted.ok) {
          return {
            ok: false,
            error:
              deleted.error ||
              `Delete failed on ${target.groupName || target.postUrl}`,
            groupResults,
          };
        }
        groupResults.push({
          ...target,
          postUrl: target.postUrl,
          status: "deleted",
        });

        const groupUrl = target.groupExternalId
          ? `https://www.facebook.com/groups/${target.groupExternalId}`
          : null;
        if (groupUrl) {
          softNavigate(groupUrl);
          await sleep(2000);
        }
        const published = await fillComposerAndPublish(content, imageFile);
        if (!published.ok) {
          return {
            ok: false,
            error:
              published.error ||
              `Repost failed on ${target.groupName || target.groupId}`,
            groupResults,
          };
        }
        if (published.postUrl) {
          groupResults.push({
            groupId: target.groupId || "",
            groupName: target.groupName || "",
            groupExternalId: target.groupExternalId || "",
            postUrl: published.postUrl,
            postFbId: extractFbIdFromUrl(published.postUrl),
            status: "live",
          });
        }
      }

      if (i < targets.length - 1) await sleep(delayMs);
    }

    setComposerFeedback("עדכון הפוסטים החיים הושלם", "ok");
    return { ok: true, updated: targets.length, groupResults };
  }

  window.__distroEnsurePanel = ensurePanel;
  window.__distroAttachImage = attachImageToFacebookComposer;
  window.__distroPrefillComposer = prefillComposer;
  window.__distroClickFacebookWhatsApp = clickFacebookNativeWhatsAppButton;

  injectRedistributeButtons();
  const feedObserver = new MutationObserver(() => {
    injectRedistributeButtons();
  });
  feedObserver.observe(document.body, { childList: true, subtree: true });
})();
