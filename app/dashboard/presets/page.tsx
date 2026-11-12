"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { GroupPresetDTO } from "@/lib/group-presets";

export default function PresetsPage() {
  const [presets, setPresets] = React.useState<GroupPresetDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [groupIdsRaw, setGroupIdsRaw] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12000);
      const res = await fetch("/api/group-presets", {
        signal: controller.signal,
        cache: "no-store",
      });
      window.clearTimeout(timer);
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        presets?: GroupPresetDTO[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        setPresets([]);
        setError(data.error || "לא ניתן לטעון תבניות כרגע");
        return;
      }
      setPresets(Array.isArray(data.presets) ? data.presets : []);
    } catch {
      setPresets([]);
      setError("שגיאה בטעינת תבניות");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createPreset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const groupIds = groupIdsRaw
        .split(/[\s,]+/)
        .map((s: any) => s.trim())
        .filter(Boolean);
      if (!name.trim() || groupIds.length === 0) {
        throw new Error("נא למלא שם ולפחות מזהה קבוצה אחד");
      }
      const res = await fetch("/api/group-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), groupIds }),
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "שמירה נכשלה");
      setName("");
      setGroupIdsRaw("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("למחוק תבנית זו?")) return;
    await fetch(`/api/group-presets/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">תבניות קבוצות</h1>
        <p className="mt-1 text-sm text-slate-500">
          שמרו סטים של קבוצות לשימוש חוזר בקוסם הקמפיינים
        </p>
      </div>

      <form
        onSubmit={(e) => void createPreset(e)}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-slate-800">תבנית חדשה</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='שם התבנית (למשל: נדל״ן השרון)'
          className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1877f2]"
        />
        <textarea
          value={groupIdsRaw}
          onChange={(e) => setGroupIdsRaw(e.target.value)}
          placeholder="מזהי קבוצות מופרדים בפסיק (מתוך מסך הקבוצות)"
          rows={3}
          className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1877f2]"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1877f2] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          שמור תבנית
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            טוען…
          </div>
        ) : presets.length === 0 ? (
          <div className="space-y-2 px-4 py-12 text-center">
            <p className="text-sm text-slate-500">
              עדיין לא נוצרו תבניות קבוצות. צור תבנית חדשה בלחיצה על הכפתור
            </p>
            {error && (
              <button
                type="button"
                onClick={() => void load()}
                className="text-xs font-medium text-[#1877f2] hover:underline"
              >
                נסה שוב
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {presets.map((p: any) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <div className="font-semibold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {(Array.isArray(p.groupIds) ? p.groupIds : []).length} קבוצות
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(p.id)}
                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                  aria-label="מחק"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
