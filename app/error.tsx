"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  const message = error?.message || "Unknown client error";
  const stack = error?.stack || "";
  const digest = error?.digest ? String(error.digest) : "";

  return (
    <div
      dir="ltr"
      style={{
        minHeight: "100vh",
        margin: 0,
        padding: "24px",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        background: "#0f172a",
        color: "#f8fafc",
      }}
    >
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>DISTRO client error</h1>
      <p style={{ color: "#fca5a5", marginBottom: 16 }}>{message}</p>
      {digest ? (
        <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 12 }}>
          digest: {digest}
        </p>
      ) : null}
      {stack ? (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
            fontSize: 12,
            lineHeight: 1.45,
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
          {stack}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        style={{
          marginTop: 16,
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          background: "#2563eb",
          color: "#fff",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
