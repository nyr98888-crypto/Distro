"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard/error]", error);
  }, [error]);

  const message = error?.message || "Unknown dashboard error";
  const stack = error?.stack || "";
  const digest = error?.digest ? String(error.digest) : "";

  return (
    <div
      dir="ltr"
      className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-slate-900"
    >
      <h1 className="text-lg font-bold text-rose-800">Dashboard client error</h1>
      <p className="font-mono text-sm text-rose-700">{message}</p>
      {digest ? (
        <p className="font-mono text-xs text-slate-500">digest: {digest}</p>
      ) : null}
      {stack ? (
        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-rose-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-800">
          {stack}
        </pre>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
