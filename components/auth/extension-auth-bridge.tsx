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

/** Push dashboard session token to the installed Chrome extension (if present). */
export function pushAuthToExtension(token: string): void {
  if (typeof window === "undefined" || !token) return;

  try {
    window.postMessage(
      { source: "distro-web", type: "AUTH_SUCCESS", token },
      window.location.origin
    );
  } catch {
    // ignore
  }

  if (!EXTENSION_ID || !window.chrome?.runtime?.sendMessage) return;

  try {
    window.chrome.runtime.sendMessage(
      EXTENSION_ID,
      { type: "AUTH_SUCCESS", token },
      () => {
        void window.chrome?.runtime?.lastError;
      }
    );
  } catch {
    // Extension not installed — expected for many visitors
  }
}

type ExtensionAuthBridgeProps = {
  /** Short-lived handoff token from the server for the logged-in user. */
  token: string | null;
};

/**
 * When the dashboard loads for an authenticated user, notify the extension
 * so it can store the session in chrome.storage.local.
 */
export function ExtensionAuthBridge({ token }: ExtensionAuthBridgeProps) {
  React.useEffect(() => {
    if (!token) return;
    pushAuthToExtension(token);
  }, [token]);

  return null;
}
