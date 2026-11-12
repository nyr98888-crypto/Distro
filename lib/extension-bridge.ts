import type { ScheduledPostDTO } from "@/lib/scheduled-posts";

export type LiveUpdateJob = {
  scheduledPostId: string;
  mode: "text" | "replace_repost";
  content: string;
  imageUrl: string;
  delaySeconds: number;
  targets: Array<{
    id: string;
    groupId: string;
    groupName: string;
    groupExternalId: string;
    postUrl: string;
    postFbId: string;
  }>;
};

export type FacebookProfile = {
  name: string;
  avatarUrl: string;
  facebookId: string;
  isConnected: boolean;
};

export type ScrapedGroup = {
  facebookGroupId: string;
  name: string;
  url?: string;
  memberCount?: number;
};

function postToPage(message: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.postMessage(
      { source: "distro-web", ...message },
      window.location.origin
    );
  } catch {
    /* ignore */
  }
}

function sendToExtensionWithResponse(
  message: Record<string, unknown>,
  cb?: (response: unknown) => void,
  timeoutMs = 15000
) {
  if (typeof window === "undefined") {
    cb?.(null);
    return;
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  let settled = false;
  const finish = (response: unknown) => {
    if (settled) return;
    settled = true;
    window.removeEventListener("message", onBridgeResponse);
    cb?.(response);
  };

  const onBridgeResponse = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      type?: string;
      requestId?: string;
      response?: unknown;
    } | null;
    if (!data || data.source !== "distro-extension") return;
    if (data.type !== "DISTRO_BRIDGE_RESPONSE") return;
    if (data.requestId !== requestId) return;
    finish(data.response ?? null);
  };

  window.addEventListener("message", onBridgeResponse);
  window.setTimeout(() => finish(null), timeoutMs);

  // Content-script web-bridge only — no hardcoded Extension ID
  postToPage({ ...message, requestId });
}

/** Subscribe to DISTRO_EXTENSION_READY from the content-script bridge. */
export function onExtensionReady(
  onReady: (info: { version: string | null }) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as {
      source?: string;
      type?: string;
      version?: string | null;
    } | null;
    if (!data || data.source !== "distro-extension") return;
    if (data.type !== "DISTRO_EXTENSION_READY") return;
    onReady({ version: data.version ?? null });
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

/** Detect installed extension via page bridge (no hardcoded Extension ID). */
export function pingExtension(onDone?: (ok: boolean) => void): void {
  sendToExtensionWithResponse(
    { type: "DISTRO_PING", action: "PING" },
    (response) => {
      const ok = Boolean(
        response &&
          typeof response === "object" &&
          ((response as { ok?: boolean }).ok === true ||
            (response as { pong?: boolean }).pong === true)
      );
      onDone?.(ok);
    },
    2500
  );
}

export function notifyExtensionSchedule(post: ScheduledPostDTO): void {
  postToPage({ type: "SCHEDULE_POST", post });
}

export function notifyExtensionCancel(postId: string): void {
  postToPage({ type: "CANCEL_SCHEDULED_POST", postId });
}

export function notifyExtensionLiveUpdate(job: LiveUpdateJob): void {
  postToPage({ type: "LIVE_UPDATE_POSTS", job });
}

/** Cookie-swap to an already saved Distro Facebook account. */
export function notifyExtensionSwitchFacebookAccountById(
  targetAccountId: string,
  onDone?: (ok: boolean, error?: string) => void
): void {
  sendToExtensionWithResponse(
    {
      type: "SWITCH_ACCOUNT",
      action: "SWITCH_ACCOUNT",
      targetAccountId,
    },
    (response) => {
      const ok = Boolean(
        response &&
          typeof response === "object" &&
          (response as { success?: boolean }).success
      );
      const error =
        response && typeof response === "object"
          ? (response as { error?: string }).error
          : "No response from extension";
      onDone?.(ok, ok ? undefined : error || "Switch failed");
    },
    20000
  );
}

/** Clear session and open Facebook login to add another profile. */
export function notifyExtensionAddFacebookAccount(
  onDone?: (ok: boolean, error?: string) => void
): void {
  sendToExtensionWithResponse(
    { type: "ADD_NEW_ACCOUNT", action: "ADD_NEW_ACCOUNT" },
    (response) => {
      const ok = Boolean(
        response &&
          typeof response === "object" &&
          (response as { success?: boolean }).success
      );
      const error =
        response && typeof response === "object"
          ? (response as { error?: string }).error
          : "No response from extension";
      onDone?.(ok, ok ? undefined : error || "Add account failed");
    },
    10000
  );
}

/**
 * Ask the extension to scrape facebook.com/groups/joins/ and return
 * { facebookGroupId, name, url, memberCount }[] — page then POSTs to /api/groups/sync.
 */
export function requestExtensionScrapeGroups(
  onDone?: (result: {
    ok: boolean;
    groups?: ScrapedGroup[];
    error?: string;
  }) => void
): void {
  sendToExtensionWithResponse(
    {
      type: "DISTRO_SYNC_GROUPS",
      action: "SCRAPE_GROUPS",
    },
    (response) => {
      if (!response || typeof response === "undefined") {
        onDone?.({
          ok: false,
          error: "No response from extension — is DISTRO installed?",
        });
        return;
      }
      if (typeof response !== "object") {
        onDone?.({
          ok: false,
          error: "No response from extension — is DISTRO installed?",
        });
        return;
      }
      const res = response as {
        success?: boolean;
        ok?: boolean;
        groups?: ScrapedGroup[];
        error?: string;
      };
      const groups = Array.isArray(res.groups) ? res.groups : [];
      const ok = res.success !== false && res.ok !== false;
      if (!ok) {
        onDone?.({
          ok: false,
          error: res.error || "Group scrape failed",
        });
        return;
      }
      onDone?.({ ok: true, groups });
    },
    120000
  );
}

/** @deprecated prefer requestExtensionScrapeGroups + page POST */
export function notifyExtensionSyncGroups(
  onDone?: (ok: boolean, error?: string) => void
): void {
  requestExtensionScrapeGroups((result) => {
    onDone?.(result.ok, result.error);
  });
}

/** @deprecated use notifyExtensionSwitchFacebookAccountById / Add */
export function notifyExtensionSwitchFacebookAccount(
  onDone?: (ok: boolean) => void
): void {
  notifyExtensionAddFacebookAccount((ok) => onDone?.(ok));
}

export function notifyExtensionGetFacebookProfile(
  onProfile: (profile: FacebookProfile | null) => void
): void {
  sendToExtensionWithResponse({ type: "GET_FACEBOOK_PROFILE" }, (response) => {
    if (
      response &&
      typeof response === "object" &&
      (response as { profile?: FacebookProfile }).profile
    ) {
      onProfile((response as { profile: FacebookProfile }).profile);
      return;
    }
    onProfile(null);
  });
}
