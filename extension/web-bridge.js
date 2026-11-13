/**
 * Page ↔ extension bridge for Distro dashboard origins.
 * Announces readiness and relays DISTRO_PING / DISTRO_SYNC_GROUPS (and other
 * distro-web messages) via chrome.runtime — no hard-coded Extension ID.
 */
(function () {
  function announceReady() {
    try {
      document.documentElement.setAttribute("data-distro-extension", "1");
      document.documentElement.dataset.distroExtension = "1";
    } catch {
      /* ignore */
    }
    try {
      window.postMessage(
        {
          source: "distro-extension",
          type: "DISTRO_EXTENSION_READY",
          version: chrome.runtime?.getManifest?.()?.version || null,
        },
        window.location.origin
      );
    } catch {
      /* ignore */
    }
  }

  function reply(requestId, response) {
    if (!requestId) return;
    try {
      window.postMessage(
        {
          source: "distro-extension",
          type: "DISTRO_BRIDGE_RESPONSE",
          requestId,
          response: response ?? null,
        },
        window.location.origin
      );
    } catch {
      /* ignore */
    }
  }

  function forwardToBackground(payload, requestId) {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        void chrome.runtime.lastError;
        reply(requestId, response ?? null);
      });
    } catch {
      reply(requestId, null);
    }
  }

  announceReady();
  window.setTimeout(announceReady, 500);
  window.setTimeout(announceReady, 2000);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "distro-web") return;

    const requestId = data.requestId;
    const type = data.type || data.action;

    if (type === "DISTRO_PING" || type === "PING") {
      forwardToBackground(
        { type: "DISTRO_PING", action: "PING" },
        requestId
      );
      return;
    }

    if (
      type === "DISTRO_SYNC_GROUPS" ||
      type === "SYNC_GROUPS" ||
      type === "SCRAPE_GROUPS"
    ) {
      forwardToBackground(
        {
          type: "DISTRO_SYNC_GROUPS",
          action: "SCRAPE_GROUPS",
        },
        requestId
      );
      return;
    }

    // AUTH_SUCCESS, SWITCH_ACCOUNT, SCHEDULE_POST, etc.
    const { source: _source, ...rest } = data;
    forwardToBackground(rest, requestId);
  });
})();
