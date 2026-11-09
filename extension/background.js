importScripts("schedule-engine.js");

const PRODUCTION_APP = "https://distro-auu6.vercel.app";
const LOCAL_APP = "http://localhost:3000";
const LOGIN_URL = `${PRODUCTION_APP}/login`;
const GROUPS_URL = "https://www.facebook.com/groups/joins/";
const ALARM_PREFIX = "distro-sched-";

function apiBases() {
  return [LOCAL_APP, PRODUCTION_APP];
}

const HEARTBEAT_ALARM = "distro-heartbeat";
const WORKER_POLL_ALARM = "distro-worker-poll";
const CATCHUP_WINDOW_MS = 12 * 60 * 60 * 1000;
/** Prevent duplicate catch-up / alarm races for the same campaign. */
const runningPostIds = new Set();

chrome.runtime.onInstalled.addListener((details) => {
  ensureHeartbeatAlarm();
  ensureWorkerPollAlarm();
  void checkMissedPosts({ notify: true });
  void pollRemoteWorkerQueue();
  if (details.reason !== "install") return;
  chrome.tabs.create({ url: PRODUCTION_APP });
  chrome.tabs.create({ url: GROUPS_URL });
});

chrome.runtime.onStartup.addListener(() => {
  ensureHeartbeatAlarm();
  ensureWorkerPollAlarm();
  void sendHeartbeat();
  void checkMissedPosts({ notify: true });
  void pollRemoteWorkerQueue();
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id && tab.url && tab.url.includes("facebook.com")) {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_DISTRO_SIDEBAR" }, () => {
      void chrome.runtime.lastError;
    });
    return;
  }
  chrome.tabs.create({ url: LOGIN_URL });
});

function alarmNameForPost(postId) {
  return `${ALARM_PREFIX}${postId}`;
}

function fireAtForPost(post) {
  const iso = post.nextRunAt || post.scheduledTime;
  if (!iso) return null;
  const when = new Date(iso).getTime();
  return Number.isNaN(when) ? null : when;
}

function scheduleAlarmForPost(post) {
  if (!post?.id) return;
  if (post.isActive === false || post.status === "paused" || post.status === "cancelled") {
    chrome.alarms.clear(alarmNameForPost(post.id));
    return;
  }
  const when = fireAtForPost(post);
  if (when == null) return;
  const name = alarmNameForPost(post.id);
  chrome.alarms.clear(name, () => {
    const delay = when - Date.now();
    chrome.alarms.create(name, {
      when: delay <= 0 ? Date.now() + 1000 : when,
    });
  });
}

function upsertScheduledPost(post, done) {
  chrome.storage.local.get(["scheduledPosts"], (stored) => {
    const list = Array.isArray(stored.scheduledPosts)
      ? stored.scheduledPosts
      : [];
    const idx = list.findIndex((p) => p.id === post.id);
    const next = {
      ...post,
      status: post.status || "pending",
      isActive: post.isActive !== false,
      syncedAt: Date.now(),
    };
    if (!next.nextRunAt && next.scheduledTime) {
      next.nextRunAt = next.scheduledTime;
    }
    if (idx >= 0) list[idx] = { ...list[idx], ...next };
    else list.push(next);
    chrome.storage.local.set({ scheduledPosts: list }, () => {
      if (
        next.isActive !== false &&
        next.status === "pending"
      ) {
        scheduleAlarmForPost(next);
      } else {
        chrome.alarms.clear(alarmNameForPost(next.id));
      }
      done?.(next);
    });
  });
}

function cancelScheduledPost(postId, done) {
  chrome.storage.local.get(["scheduledPosts"], (stored) => {
    const list = Array.isArray(stored.scheduledPosts)
      ? stored.scheduledPosts
      : [];
    const next = list.map((p) =>
      p.id === postId
        ? { ...p, status: "cancelled", isActive: false, nextRunAt: null }
        : p
    );
    chrome.storage.local.set({ scheduledPosts: next }, () => {
      chrome.alarms.clear(alarmNameForPost(postId));
      done?.();
    });
  });
}

function patchLocalPost(postId, patch, done) {
  chrome.storage.local.get(["scheduledPosts"], (stored) => {
    const list = Array.isArray(stored.scheduledPosts)
      ? stored.scheduledPosts
      : [];
    const next = list.map((p) => (p.id === postId ? { ...p, ...patch } : p));
    chrome.storage.local.set({ scheduledPosts: next }, () => {
      const updated = next.find((p) => p.id === postId);
      done?.(updated);
    });
  });
}

function withAuthHeaders(extra = {}) {
  return new Promise((resolve) => {
    chrome.storage.local.get(["sessionToken"], (stored) => {
      const headers = {
        "Content-Type": "application/json",
        ...extra,
      };
      if (stored.sessionToken) {
        headers.Authorization = `Bearer ${stored.sessionToken}`;
      }
      resolve(headers);
    });
  });
}

async function syncPostToApi(postId, body) {
  const headers = await withAuthHeaders();
  for (const base of apiBases()) {
    try {
      const res = await fetch(`${base}/api/scheduled-posts/${postId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (res.ok) return;
    } catch {
      /* try next */
    }
  }
}

async function syncPublishedResults(postId, results, replace = false) {
  if (!results?.length) return;
  const headers = await withAuthHeaders();
  const body = JSON.stringify({ results, replace });
  for (const base of apiBases()) {
    try {
      const res = await fetch(
        `${base}/api/scheduled-posts/${postId}/published`,
        {
          method: "POST",
          headers,
          body,
          credentials: "include",
        }
      );
      if (res.ok) return;
    } catch {
      /* try next */
    }
  }
}

async function apiFetchJson(path, options = {}) {
  const headers = await withAuthHeaders(options.headers || {});
  let lastBody = null;
  for (const base of apiBases()) {
    try {
      const res = await fetch(`${base}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      if (res.ok) return body;
      if (body) lastBody = body;
    } catch {
      /* try next */
    }
  }
  return lastBody;
}

/** Notify Distro dashboard tabs that the active Facebook account changed. */
async function broadcastAccountSwitched(account) {
  const payload = { type: "ACCOUNT_SWITCHED", account };
  chrome.runtime.sendMessage(payload, () => void chrome.runtime.lastError);
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "http://localhost/*",
        "http://127.0.0.1/*",
        "https://distro-auu6.vercel.app/*",
      ],
    });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs
        .sendMessage(tab.id, payload)
        .catch(() => {
          /* tab may not have a listener */
        });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (acc) => {
            window.postMessage(
              { source: "distro-extension", type: "ACCOUNT_SWITCHED", account: acc },
              window.location.origin
            );
            window.dispatchEvent(
              new CustomEvent("distro-account-switched", { detail: acc })
            );
          },
          args: [account || null],
        });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function ensureHeartbeatAlarm() {
  chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: 10,
  });
}

/** Poll Turso-backed remote queue every ~1 minute (iPhone → desktop jobs). */
function ensureWorkerPollAlarm() {
  chrome.alarms.create(WORKER_POLL_ALARM, {
    periodInMinutes: 1,
  });
}

async function sendHeartbeat() {
  await apiFetchJson("/api/device/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      isOnline: true,
      extensionVersion: chrome.runtime.getManifest().version,
    }),
  });
}

async function reportWorkerStatus(campaignId, status, extra = {}) {
  return apiFetchJson("/api/worker/status-update", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      status,
      ...extra,
    }),
  });
}

/**
 * Pull queued campaigns created from iPhone / dashboard and execute them
 * on this desktop Facebook session with anti-ban delay handled in content.js.
 */
async function pollRemoteWorkerQueue() {
  const data = await apiFetchJson("/api/worker/poll", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!data?.success) return;

  const jobs = Array.isArray(data.campaigns)
    ? data.campaigns
    : Array.isArray(data.jobs)
      ? data.jobs
      : [];

  for (const job of jobs) {
    if (!job?.id) continue;
    if (runningPostIds.has(job.id)) continue;
    const status = job.status || "queued";
    if (status !== "queued" && status !== "pending" && status !== "failed") {
      continue;
    }

    // Normalize worker payload into the scheduled-post shape content.js expects
    const post = {
      ...job,
      status: "pending",
      isActive: true,
      imageUrl: job.imageUrl || job.image_url || "",
      targetGroups:
        job.targetGroups ||
        job.target_groups ||
        (Array.isArray(job.target_group_ids)
          ? job.target_group_ids.map((id) => ({ id, name: String(id) }))
          : []),
      delaySeconds: job.delaySeconds || job.delay_seconds || 60,
      scheduleType:
        job.scheduleType === "now" || job.schedule_type === "now"
          ? "immediate"
          : job.scheduleType || job.schedule_type || "once",
      nextRunAt: job.nextRunAt || job.next_run_at || new Date().toISOString(),
    };

    upsertScheduledPost(post, () => {
      void runScheduledPost(post);
    });
  }
}

function notifyCatchup(campaignName) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "DISTRO - השלמת פרסום",
      message: `קמפיין "${campaignName || "ללא שם"}" המתין בזמן שהמחשב היה כבוי. מפרסם כעת...`,
    });
  } catch {
    /* notifications may be blocked */
  }
}

/** Missed-post catch-up: fire overdue campaigns within a 12h window. */
async function checkMissedPosts({ notify = false } = {}) {
  const now = Date.now();

  // 1) Local storage first (works offline / before auth)
  chrome.storage.local.get(["scheduledPosts"], (stored) => {
    const list = Array.isArray(stored.scheduledPosts)
      ? stored.scheduledPosts
      : [];
    for (const post of list) {
      if (post.isActive === false) continue;
      if (post.status !== "pending" && post.status !== "failed") continue;
      const iso = post.nextRunAt || post.scheduledTime;
      if (!iso) continue;
      const when = new Date(iso).getTime();
      if (Number.isNaN(when) || when >= now) continue;
      if (now - when > CATCHUP_WINDOW_MS) continue;
      if (notify) notifyCatchup(post.name);
      void runScheduledPost(post);
    }
  });

  // 2) Server pending list (authoritative)
  const data = await apiFetchJson("/api/campaigns/pending");
  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];
  for (const camp of campaigns) {
    if (camp.status !== "pending" && camp.status !== "failed") continue;
    if (!camp.isActive) continue;
    if (notify) notifyCatchup(camp.name);
    upsertScheduledPost(camp, (saved) => {
      if (saved) void runScheduledPost(saved);
    });
  }
}

async function completeRunOnApi(postId) {
  return apiFetchJson(`/api/campaigns/${postId}/complete-run`, {
    method: "POST",
    body: "{}",
  });
}

async function ensureFacebookTab() {
  const tabs = await chrome.tabs.query({ url: ["https://*.facebook.com/*"] });
  if (tabs[0]?.id) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    return tabs[0].id;
  }
  const created = await chrome.tabs.create({
    url: "https://www.facebook.com/",
    active: true,
  });
  return created.id;
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response" });
    });
  });
}

async function runScheduledPost(post) {
  if (!post?.id) return;
  if (runningPostIds.has(post.id)) return;
  runningPostIds.add(post.id);

  patchLocalPost(post.id, { status: "running" });
  syncPostToApi(post.id, { status: "running" });
  void reportWorkerStatus(post.id, "processing");

  try {
    const tabId = await ensureFacebookTab();
    await new Promise((r) => setTimeout(r, 1500));

    // Ensure default 60s anti-ban delay when remote jobs omit it
    const execPost = {
      ...post,
      delaySeconds: Number(post.delaySeconds) > 0 ? post.delaySeconds : 60,
    };

    const result = await sendToTab(tabId, {
      action: "EXECUTE_SCHEDULED_POST",
      post: execPost,
    });

    if (!result?.ok) {
      throw new Error(result?.error || "Automation failed");
    }

    if (Array.isArray(result.groupResults) && result.groupResults.length) {
      await syncPublishedResults(post.id, result.groupResults);
      patchLocalPost(post.id, {
        publishedPosts: result.groupResults,
      });
    }

    // Prefer worker status-update (advances runs_count + next_run_at).
    // Group results already synced via /published — avoid duplicates.
    const statusRes = await reportWorkerStatus(post.id, "completed");
    if (statusRes?.success && (statusRes.post || statusRes.campaign)) {
      upsertScheduledPost(statusRes.post || statusRes.campaign);
      return;
    }

    // Fallback lifecycle endpoint
    const completed = await completeRunOnApi(post.id);
    if (completed?.success && completed.post) {
      upsertScheduledPost(completed.post);
      return;
    }

    const runsCount = (post.runsCount || 0) + 1;
    const deactivate = self.shouldDeactivateAfterRun({
      ...post,
      runsCount: runsCount - 1,
    });

    if (deactivate) {
      const patch = {
        runsCount,
        status: "completed",
        isActive: false,
        nextRunAt: null,
      };
      patchLocalPost(post.id, patch);
      syncPostToApi(post.id, patch);
      chrome.alarms.clear(alarmNameForPost(post.id));
      return;
    }

    const nextRunAt = self.calculateNextRun({
      ...post,
      runsCount,
      isActive: true,
    });

    const patch = {
      runsCount,
      status: "pending",
      isActive: true,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
      scheduledTime: post.scheduleType === "once"
        ? post.scheduledTime
        : nextRunAt
          ? nextRunAt.toISOString()
          : post.scheduledTime,
    };
    patchLocalPost(post.id, patch, (updated) => {
      if (updated) scheduleAlarmForPost(updated);
    });
    syncPostToApi(post.id, {
      runsCount: patch.runsCount,
      status: patch.status,
      isActive: patch.isActive,
      nextRunAt: patch.nextRunAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    patchLocalPost(post.id, { status: "failed", errorMessage: message });
    syncPostToApi(post.id, { status: "failed", errorMessage: message });
    void reportWorkerStatus(post.id, "failed", { errorMessage: message });
  } finally {
    runningPostIds.delete(post.id);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm?.name) return;
  if (alarm.name === HEARTBEAT_ALARM) {
    void sendHeartbeat();
    return;
  }
  if (alarm.name === WORKER_POLL_ALARM) {
    void pollRemoteWorkerQueue();
    return;
  }
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const postId = alarm.name.slice(ALARM_PREFIX.length);
  chrome.storage.local.get(["scheduledPosts"], (stored) => {
    const list = Array.isArray(stored.scheduledPosts)
      ? stored.scheduledPosts
      : [];
    const post = list.find(
      (p) =>
        p.id === postId &&
        p.isActive !== false &&
        (p.status === "pending" || p.status === "failed")
    );
    if (!post) return;
    void runScheduledPost(post);
  });
});

// Boot heartbeat + remote worker poll + catch-up when the service worker wakes
ensureHeartbeatAlarm();
ensureWorkerPollAlarm();
void sendHeartbeat();
void pollRemoteWorkerQueue();

async function runLiveUpdateJob(job) {
  const tabId = await ensureFacebookTab();
  await new Promise((r) => setTimeout(r, 1200));
  const result = await sendToTab(tabId, {
    action: "EXECUTE_LIVE_UPDATE",
    job,
  });
  if (!result?.ok) {
    throw new Error(result?.error || "Live update failed");
  }
  if (Array.isArray(result.groupResults) && result.groupResults.length) {
    await syncPublishedResults(
      job.scheduledPostId,
      result.groupResults,
      job.mode === "replace_repost"
    );
  }
  return result;
}

function handleScheduleMessage(message, sendResponse) {
  if (message?.type === "SCHEDULE_POST" && message.post) {
    upsertScheduledPost(message.post, () =>
      sendResponse({ success: true })
    );
    return true;
  }
  if (message?.type === "CANCEL_SCHEDULED_POST" && message.postId) {
    cancelScheduledPost(message.postId, () =>
      sendResponse({ success: true })
    );
    return true;
  }
  if (message?.type === "LIVE_UPDATE_POSTS" && message.job) {
    void runLiveUpdateJob(message.job)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : "Live update failed",
        })
      );
    return true;
  }
  return false;
}

const FB_AUTH_COOKIES = ["c_user", "xs", "datr", "fr", "sb", "presence"];

function cookieUrl(cookie) {
  const domain = cookie.domain?.startsWith(".")
    ? cookie.domain.slice(1)
    : cookie.domain || "facebook.com";
  const path = cookie.path || "/";
  return `https://${domain}${path}`;
}

function clearFacebookAuthCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: ".facebook.com" }, (cookies) => {
      const list = Array.isArray(cookies) ? cookies : [];
      const targets = list.filter((c) => FB_AUTH_COOKIES.includes(c.name));
      let pending = targets.length;
      if (!pending) {
        resolve(0);
        return;
      }
      let removed = 0;
      for (const c of targets) {
        chrome.cookies.remove({ url: cookieUrl(c), name: c.name }, () => {
          removed += 1;
          pending -= 1;
          if (pending <= 0) resolve(removed);
        });
      }
    });
  });
}

function resetLocalFacebookCache(done) {
  chrome.storage.local.remove(
    [
      "syncedGroups",
      "fbProfile",
      "facebookProfile",
      "postQueue",
      "latestPostJob",
    ],
    () => done?.()
  );
}

function buildProfileFromUserId(userId, name) {
  return {
    facebookId: String(userId),
    name: name || `משתמש ${String(userId).slice(-4)}`,
    avatarUrl: `https://graph.facebook.com/${userId}/picture?type=large`,
    isConnected: true,
    syncedAt: Date.now(),
  };
}

async function readFacebookProfile() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      { url: "https://www.facebook.com", name: "c_user" },
      (cookie) => {
        chrome.storage.local.get(["fbProfile"], (stored) => {
          if (!cookie?.value) {
            resolve({
              isConnected: false,
              name: "",
              avatarUrl: "",
              facebookId: "",
            });
            return;
          }
          const cached = stored.fbProfile;
          if (cached?.facebookId === cookie.value) {
            resolve({ ...cached, isConnected: true });
            return;
          }
          resolve(buildProfileFromUserId(cookie.value, cached?.name));
        });
      }
    );
  });
}

function getAllFacebookCookies() {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: ".facebook.com" }, (cookies) => {
      resolve(
        (cookies || []).map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
          sameSite: c.sameSite,
        }))
      );
    });
  });
}

async function restoreFacebookCookies(cookies) {
  let restored = 0;
  for (const c of cookies || []) {
    if (!c?.name || c.value == null) continue;
    const domain = c.domain || ".facebook.com";
    const path = c.path || "/";
    const urlHost = domain.startsWith(".") ? domain.slice(1) : domain;
    const details = {
      url: `https://${urlHost}${path}`,
      name: c.name,
      value: String(c.value),
      domain,
      path,
      secure: c.secure !== false,
      httpOnly: Boolean(c.httpOnly),
    };
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    if (c.sameSite && c.sameSite !== "unspecified") {
      details.sameSite = c.sameSite;
    }
    try {
      await chrome.cookies.set(details);
      restored += 1;
    } catch {
      /* some cookies may refuse set without host permissions nuances */
    }
  }
  return restored;
}

async function switchToSavedAccount(targetAccountId) {
  if (!targetAccountId) {
    return { success: false, error: "Missing targetAccountId" };
  }

  const currentCookies = await getAllFacebookCookies();
  const profile = await readFacebookProfile();

  const switchRes = await apiFetchJson("/api/facebook/accounts/switch", {
    method: "POST",
    body: JSON.stringify({
      targetAccountId,
      currentCookies,
      currentProfile: {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    }),
  });

  if (!switchRes?.success) {
    return {
      success: false,
      error: switchRes?.error || "Server switch failed",
    };
  }

  if (!(switchRes.cookies || []).length) {
    return {
      success: false,
      error: "לחשבון היעד אין עוגיות שמורות — התחברו אליו שוב דרך 'הוסף חשבון'",
    };
  }

  resetLocalFacebookCache();
  await clearFacebookAuthCookies();
  // Clear a wider set so restore isn't polluted
  const all = await getAllFacebookCookies();
  for (const c of all) {
    await chrome.cookies.remove({ url: cookieUrl(c), name: c.name });
  }

  const restored = await restoreFacebookCookies(switchRes.cookies || []);
  const account = switchRes.account;
  if (account) {
    chrome.storage.local.set({
      fbProfile: {
        facebookId: account.facebookId,
        name: account.name,
        avatarUrl: account.avatarUrl,
        isConnected: true,
        accountId: account.id,
        syncedAt: Date.now(),
      },
      awaitingFbLogin: false,
      awaitingAddAccount: false,
    });
  }

  // Refresh Facebook tabs so the new session sticks
  const tabs = await chrome.tabs.query({
    url: ["https://*.facebook.com/*", "https://www.facebook.com/*"],
  });
  for (const tab of tabs) {
    if (tab.id) chrome.tabs.reload(tab.id);
  }

  await broadcastAccountSwitched(account);

  return {
    success: true,
    restored,
    account,
    accounts: switchRes.accounts,
  };
}

/** Add another Facebook profile without deleting existing Distro accounts. */
async function addNewFacebookAccount() {
  const currentCookies = await getAllFacebookCookies();
  const profile = await readFacebookProfile();

  // Persist current session onto the active Distro account before clearing
  if (profile.facebookId && currentCookies.length) {
    await apiFetchJson("/api/facebook/accounts", {
      method: "POST",
      body: JSON.stringify({
        facebookId: profile.facebookId,
        name: profile.name || "Facebook User",
        avatarUrl: profile.avatarUrl || "",
        cookies: currentCookies,
        makeActive: true,
      }),
    });
  }

  const prev = profile.facebookId || null;
  await chrome.storage.local.set({
    awaitingAddAccount: true,
    awaitingFbLogin: true,
    previousFbUserId: prev,
  });

  await clearFacebookAuthCookies();
  await chrome.tabs.create({
    url: "https://www.facebook.com/login/",
    active: true,
  });

  return { success: true };
}

/** Legacy: open login after clearing (same as add). */
async function switchFacebookAccount() {
  return addNewFacebookAccount();
}

async function triggerGroupSyncAfterLogin() {
  const tabs = await chrome.tabs.query({
    url: ["https://*.facebook.com/*", "https://www.facebook.com/*"],
  });
  let tabId = tabs.find((t) => t.url?.includes("/groups/"))?.id || tabs[0]?.id;
  if (!tabId) {
    const created = await chrome.tabs.create({
      url: GROUPS_URL,
      active: true,
    });
    tabId = created.id;
    await new Promise((r) => setTimeout(r, 3500));
  } else if (!tabs.find((t) => t.id === tabId)?.url?.includes("/groups/joins")) {
    await chrome.tabs.update(tabId, { url: GROUPS_URL, active: true });
    await new Promise((r) => setTimeout(r, 3500));
  }

  const result = await sendToTab(tabId, { action: "RUN_DISTRO_SYNC" });
  if (!result?.ok) {
    await chrome.tabs.update(tabId, { url: GROUPS_URL, active: true });
  }

  const cookies = await getAllFacebookCookies();
  const cookie = cookies.find((c) => c.name === "c_user");
  if (cookie?.value) {
    let profile = buildProfileFromUserId(cookie.value);
    try {
      const scraped = await sendToTab(tabId, { action: "GET_FACEBOOK_PROFILE" });
      if (scraped?.profile?.name) {
        profile = {
          ...profile,
          name: scraped.profile.name,
          avatarUrl: scraped.profile.avatarUrl || profile.avatarUrl,
        };
      }
    } catch {
      /* keep graph fallback */
    }
    // Persist as Distro multi-account entry
    const saved = await apiFetchJson("/api/facebook/accounts", {
      method: "POST",
      body: JSON.stringify({
        facebookId: cookie.value,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        cookies,
        makeActive: true,
      }),
    });
    chrome.storage.local.set({
      fbProfile: {
        ...profile,
        accountId: saved?.accountId || null,
        isConnected: true,
        syncedAt: Date.now(),
      },
      awaitingFbLogin: false,
      awaitingAddAccount: false,
    });
    await broadcastAccountSwitched({
      id: saved?.accountId,
      facebookId: cookie.value,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      isActive: true,
    });
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "DISTRO",
        message: "חשבון פייסבוק חדש נשמר — מסנכרן קבוצות…",
      });
    } catch {
      /* ignore */
    }
  }
}

chrome.cookies.onChanged.addListener((changeInfo) => {
  const c = changeInfo.cookie;
  if (!c || c.name !== "c_user") return;
  if (changeInfo.removed) return;
  if (!c.domain.includes("facebook.com")) return;

  chrome.storage.local.get(
    ["awaitingFbLogin", "awaitingAddAccount", "previousFbUserId", "fbProfile"],
    (stored) => {
      if (!stored.awaitingFbLogin && !stored.awaitingAddAccount) {
        if (c.value && stored.fbProfile?.facebookId !== c.value) {
          chrome.storage.local.set({
            fbProfile: buildProfileFromUserId(
              c.value,
              stored.fbProfile?.name
            ),
          });
        }
        return;
      }
      if (stored.previousFbUserId && stored.previousFbUserId === c.value) {
        return;
      }
      void triggerGroupSyncAfterLogin();
    }
  );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "AUTH_SUCCESS" && typeof message.token === "string") {
    chrome.storage.local.set(
      { sessionToken: message.token, authenticatedAt: Date.now() },
      () => sendResponse({ ok: true })
    );
    return true;
  }
  if (message?.type === "GET_AUTH") {
    chrome.storage.local.get(["sessionToken", "authenticatedAt"], (stored) => {
      sendResponse({
        authenticated: Boolean(stored.sessionToken),
        sessionToken: stored.sessionToken || null,
      });
    });
    return true;
  }
  if (
    message?.type === "SWITCH_ACCOUNT" ||
    message?.action === "SWITCH_ACCOUNT"
  ) {
    void switchToSavedAccount(message.targetAccountId)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : "Switch failed",
        })
      );
    return true;
  }
  if (
    message?.type === "ADD_NEW_ACCOUNT" ||
    message?.action === "ADD_NEW_ACCOUNT" ||
    message?.type === "SWITCH_FACEBOOK_ACCOUNT" ||
    message?.action === "SWITCH_FACEBOOK_ACCOUNT"
  ) {
    void addNewFacebookAccount()
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : "Add account failed",
        })
      );
    return true;
  }
  if (message?.type === "GET_FACEBOOK_PROFILE") {
    void readFacebookProfile().then((profile) =>
      sendResponse({ success: true, profile })
    );
    return true;
  }
  if (
    message?.type === "SYNC_GROUPS_TO_SERVER" ||
    message?.action === "SYNC_GROUPS_TO_SERVER"
  ) {
    void (async () => {
      const payload = message.payload || {};
      // Always prefer chrome.cookies (includes httpOnly session cookies)
      const cookies = await getAllFacebookCookies();
      const body = {
        accountId: payload.accountId,
        facebookId: payload.facebookId,
        name: payload.name,
        avatarUrl: payload.avatarUrl,
        groups: payload.groups || [],
        cookies: cookies.length ? cookies : payload.cookies || [],
      };
      const data = await apiFetchJson("/api/facebook/groups", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data?.success) {
        await broadcastAccountSwitched({
          id: data.accountId,
          name: data.accountName,
          avatarUrl: data.avatarUrl,
          isActive: true,
        });
      }
      sendResponse(data || { success: false, error: "Sync request failed" });
    })().catch((err) =>
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : "Sync failed",
      })
    );
    return true;
  }
  if (handleScheduleMessage(message, sendResponse)) return true;

  if (message?.action === "START_POSTING_QUEUE" && message.data) {
    const data = message.data;
    const scheduledFor = data.scheduledFor
      ? new Date(data.scheduledFor).getTime()
      : 0;
    const isRecurring = data.scheduleType === "recurring";

    if (isRecurring || (scheduledFor && scheduledFor > Date.now() + 30_000)) {
      const post = {
        id: data.id || `local-${Date.now()}`,
        name: (data.text || "").slice(0, 80),
        content: data.text || "",
        imageUrl: data.imageDataUrl || "",
        imageDataUrl: data.imageDataUrl || null,
        imageName: data.imageName || null,
        imageType: data.imageType || null,
        targetGroups: data.groups || [],
        scheduledTime: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : new Date().toISOString(),
        nextRunAt: scheduledFor
          ? new Date(scheduledFor).toISOString()
          : null,
        delaySeconds: data.delaySeconds || 60,
        status: "pending",
        scheduleType: data.scheduleType || "once",
        daysOfWeek: data.daysOfWeek || [],
        runTime: data.runTime || "07:00",
        endDate: data.endDate || null,
        maxRuns: data.maxRuns ?? null,
        runsCount: 0,
        isActive: true,
        whatsapp: data.whatsapp || null,
      };
      if (isRecurring) {
        const next = self.calculateNextRun(post);
        post.nextRunAt = next ? next.toISOString() : null;
        if (next) post.scheduledTime = next.toISOString();
      }
      upsertScheduledPost(post, () =>
        sendResponse({ success: true, scheduled: true })
      );
      return true;
    }

    const job = {
      ...data,
      queuedAt: Date.now(),
      status: "queued",
    };
    chrome.storage.local.get(["postQueue"], (stored) => {
      const queue = Array.isArray(stored.postQueue) ? stored.postQueue : [];
      queue.push(job);
      chrome.storage.local.set({ postQueue: queue, latestPostJob: job }, () => {
        sendResponse({ success: true, queueLength: queue.length });
      });
    });
    return true;
  }
  return false;
});

chrome.runtime.onMessageExternal.addListener(
  (message, _sender, sendResponse) => {
    if (message?.type === "AUTH_SUCCESS" && typeof message.token === "string") {
      chrome.storage.local.set(
        { sessionToken: message.token, authenticatedAt: Date.now() },
        () => sendResponse({ ok: true })
      );
      return true;
    }
    if (
      message?.type === "SWITCH_ACCOUNT" ||
      message?.action === "SWITCH_ACCOUNT"
    ) {
      void switchToSavedAccount(message.targetAccountId)
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Switch failed",
          })
        );
      return true;
    }
    if (
      message?.type === "ADD_NEW_ACCOUNT" ||
      message?.action === "ADD_NEW_ACCOUNT" ||
      message?.type === "SWITCH_FACEBOOK_ACCOUNT" ||
      message?.action === "SWITCH_FACEBOOK_ACCOUNT"
    ) {
      void addNewFacebookAccount()
        .then((result) => sendResponse(result))
        .catch((err) =>
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "Add account failed",
          })
        );
      return true;
    }
    if (message?.type === "GET_FACEBOOK_PROFILE") {
      void readFacebookProfile().then((profile) =>
        sendResponse({ success: true, profile })
      );
      return true;
    }
    if (handleScheduleMessage(message, sendResponse)) return true;
    return false;
  }
);

chrome.storage.local.get(["scheduledPosts"], (stored) => {
  const list = Array.isArray(stored.scheduledPosts) ? stored.scheduledPosts : [];
  for (const post of list) {
    if (post.isActive !== false && post.status === "pending") {
      scheduleAlarmForPost(post);
    }
  }
});
