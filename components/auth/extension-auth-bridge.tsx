"use client";

import * as React from "react";

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          responseCallback?: (response: unknown) => void
        ) => void;
        lastError?: { message?: string };
      };
    };
  }
}

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || "";

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

  if (!EXTENSION_ID || !window.chrome?.runtime?.sendMessage) return;

  try {
    window.chrome.runtime.sendMessage(EXTENSION_ID, payload, () => {
      void window.chrome?.runtime?.lastError;
    });
  } catch {
    // Extension not installed — expected for many visitors
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
