/**
 * Forwards dashboard window.postMessage events into the extension service worker
 * and posts the async response back so the Distro web app can await SWITCH_ACCOUNT /
 * ADD_NEW_ACCOUNT without a hard-coded NEXT_PUBLIC_EXTENSION_ID.
 */
(function () {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "distro-web") return;
    const requestId = data.requestId;
    try {
      chrome.runtime.sendMessage(data, (response) => {
        void chrome.runtime.lastError;
        if (!requestId) return;
        window.postMessage(
          {
            source: "distro-extension",
            type: "DISTRO_BRIDGE_RESPONSE",
            requestId,
            response: response ?? null,
          },
          window.location.origin
        );
      });
    } catch {
      if (!requestId) return;
      window.postMessage(
        {
          source: "distro-extension",
          type: "DISTRO_BRIDGE_RESPONSE",
          requestId,
          response: null,
        },
        window.location.origin
      );
    }
  });
})();
