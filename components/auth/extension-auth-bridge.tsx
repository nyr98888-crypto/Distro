"use client";

import * as React from "react";

/** Push dashboard session token + userId to the Chrome extension (if present). */
export function pushAuthToExtension(
  token: string,
  userId?: string | null
): void {
  if (typeof window === "undefined" || !token) return;

  const payload = {
    source: "distro-web",
    type: "AUTH_SUCCESS",
    token,
    userId: userId || null,
  };

  try {
    window.postMessage(payload, window.location.origin);
  } catch {
    // ignore
  }
}

type ExtensionAuthBridgeProps = {
  /** Longer-lived extension session token for the logged-in user. */
  token: string | null;
  userId?: string | null;
};

/**
 * When the dashboard loads for an authenticated user, notify the extension
 * so it can store sessionToken + userId in chrome.storage.local.
 * Uses window.postMessage → web-bridge (no hardcoded Extension ID).
 */
export function ExtensionAuthBridge({
  token,
  userId,
}: ExtensionAuthBridgeProps) {
  React.useEffect(() => {
    if (!token) return;
    pushAuthToExtension(token, userId);
    // Re-push a few times in case the content script loads late
    const t1 = window.setTimeout(
      () => pushAuthToExtension(token, userId),
      1500
    );
    const t2 = window.setTimeout(
      () => pushAuthToExtension(token, userId),
      4000
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [token, userId]);

  return null;
}
