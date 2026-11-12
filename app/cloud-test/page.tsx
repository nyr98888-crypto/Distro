"use client";

import { useState, useEffect, useCallback } from "react";

type CloudCampaign = {
  id: string;
  group_url: string;
  post_text: string;
  status: string;
  error_log?: string | null;
};

export default function DistroCloudTestPage() {
  const [campaigns, setCampaigns] = useState<CloudCampaign[]>([]);
  const [groupUrl, setGroupUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [cookiesJson, setCookiesJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/cloud-test/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      // keep last list on transient network errors
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
    const timer = setInterval(() => void loadCampaigns(), 8000);
    return () => clearInterval(timer);
  }, [loadCampaigns]);

  const queuePost = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cloud-test/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupUrl, postText }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error || "Failed to queue post");
      } else {
        setGroupUrl("");
        setPostText("");
        setMessage("Queued");
      }
      await loadCampaigns();
    } finally {
      setBusy(false);
    }
  };

  const triggerWorkerNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const headers: HeadersInit = {};
      const distroKey =
        typeof window !== "undefined"
          ? window.localStorage.getItem("distro_api_key")
          : null;
      if (distroKey) headers["x-distro-key"] = distroKey;

      const res = await fetch("/api/worker", { headers });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Worker failed");
      } else {
        setMessage(
          data.message ||
            (data.processed != null
              ? `Processed ${data.processed}`
              : "Worker finished")
        );
      }
      await loadCampaigns();
    } finally {
      setBusy(false);
    }
  };

  const saveCookies = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cloud-test/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_cookies", cookiesJson }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMessage(data.error || "Failed to save cookies");
      } else {
        setCookiesJson("");
        setMessage("Test cookies saved to Turso");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 p-4 font-sans">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">DISTRO Cloud Test</h1>
        <button
          type="button"
          onClick={() => void triggerWorkerNow()}
          disabled={busy}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Running..." : "Run Worker Now"}
        </button>
      </div>

      {message && (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {message}
        </p>
      )}

      <form onSubmit={queuePost} className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">New Group Post</h2>
        <input
          type="url"
          required
          placeholder="https://www.facebook.com/groups/..."
          value={groupUrl}
          onChange={(e) => setGroupUrl(e.target.value)}
          className="w-full rounded border p-2 text-sm"
        />
        <textarea
          required
          rows={3}
          placeholder="Post text..."
          value={postText}
          onChange={(e) => setPostText(e.target.value)}
          className="w-full rounded border p-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Queue Post
        </button>
      </form>

      <div className="space-y-2">
        <h2 className="font-semibold">Recent Jobs (Live)</h2>
        {campaigns.length === 0 && (
          <p className="text-sm text-gray-500">No jobs yet.</p>
        )}
        {campaigns.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-2 rounded border p-3 text-sm"
          >
            <div className="min-w-0 truncate">
              <div className="truncate font-medium">{c.post_text}</div>
              <div className="truncate text-xs text-gray-500">
                {c.group_url}
              </div>
              {c.error_log && (
                <div className="mt-1 text-xs text-red-500">{c.error_log}</div>
              )}
            </div>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase">
              {c.status}
            </span>
          </div>
        ))}
      </div>

      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          Test Account Cookies (JSON)
        </summary>
        <textarea
          rows={3}
          placeholder="Paste JSON array from Cookie-Editor..."
          value={cookiesJson}
          onChange={(e) => setCookiesJson(e.target.value)}
          className="mt-2 w-full rounded border p-2 font-mono text-xs"
        />
        <button
          type="button"
          onClick={() => void saveCookies()}
          disabled={busy || !cookiesJson}
          className="mt-2 rounded bg-gray-800 px-3 py-1.5 text-xs text-white disabled:opacity-60"
        >
          Save Cookies
        </button>
      </details>
    </main>
  );
}
