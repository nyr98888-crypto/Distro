"use client";

import * as React from "react";
import { Copy, Loader2, Pause, Pencil, Play, Trash2, RefreshCw } from "lucide-react";
import {
  cadenceLabelHe,
  matchesCampaignFilter,
  statusLabelHe,
  statusTone,
  type CampaignLifecycleFilter,
  type ScheduledPostDTO,
} from "@/lib/scheduled-posts";
import {
  notifyExtensionCancel,
  notifyExtensionLiveUpdate,
  notifyExtensionSchedule,
} from "@/lib/extension-bridge";
import { cn } from "@/lib/utils";

const FILTERS: CampaignLifecycleFilter[] = [
  "active",
  "paused",
  "completed",
  "all",
];

function filterLabel(f: CampaignLifecycleFilter): string {
  switch (f) {
    case "active":
      return "פעיל";
    case "paused":
      return "מושהה";
    case "completed":
      return "הסתיים";
    default:
      return "הכל";
  }
}

type ActiveCampaignsProps = {
  onEdit?: (id: string) => void;
  onCreateNew?: () => void;
};

export function ActiveCampaigns({
  onEdit,
  onCreateNew,
}: ActiveCampaignsProps = {}) {
  const [posts, setPosts] = React.useState<ScheduledPostDTO[]>([]);
  const [filter, setFilter] = React.useState<CampaignLifecycleFilter>("active");
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scheduled-posts");
      const data = (await res.json()) as {
        success: boolean;
        posts?: ScheduledPostDTO[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "טעינת הקמפיינים נכשלה");
      }
      setPosts(data.posts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = React.useMemo(
    () => posts.filter((p) => matchesCampaignFilter(p, filter)),
    [posts, filter]
  );

  async function patchCampaign(
    id: string,
    body: Record<string, unknown>
  ): Promise<ScheduledPostDTO | null> {
    const res = await fetch(`/api/scheduled-posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      success: boolean;
      post?: ScheduledPostDTO;
      error?: string;
    };
    if (!res.ok || !data.success || !data.post) {
      throw new Error(data.error || "עדכון נכשל");
    }
    setPosts((prev) =>
      prev.map((p) => (p.id === data.post!.id ? data.post! : p))
    );
    return data.post;
  }

  async function togglePause(post: ScheduledPostDTO) {
    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const pausing = post.status !== "paused" && post.isActive;
      const updated = await patchCampaign(post.id, pausing
        ? { status: "paused", isActive: false }
        : { status: "pending", isActive: true });
      if (!updated) return;
      if (pausing) {
        notifyExtensionCancel(updated.id);
        setMessage("הקמפיין הושהה — הריצות הבאות הוקפאו");
      } else {
        notifyExtensionSchedule(updated);
        setMessage("הקמפיין הופעל מחדש");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "השהיה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicateCampaign(post: ScheduledPostDTO) {
    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const isRecurring = post.scheduleType === "recurring";
      const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${post.name || "קמפיין"} (עותק)`,
          content: post.content,
          imageUrl: post.imageUrl || "",
          targetGroups: post.targetGroups,
          scheduledTime: isRecurring ? null : soon,
          delaySeconds: post.delaySeconds,
          scheduleType: isRecurring ? "recurring" : "once",
          daysOfWeek: post.daysOfWeek,
          runTime: post.runTime,
          endDate: post.endDate,
          maxRuns: post.maxRuns,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        post?: ScheduledPostDTO;
        error?: string;
      };
      if (!res.ok || !data.success || !data.post) {
        throw new Error(data.error || "שכפול נכשל");
      }
      const paused = await patchCampaign(data.post.id, {
        status: "paused",
        isActive: false,
      });
      notifyExtensionCancel(data.post.id);
      if (paused) {
        setPosts((prev) => {
          const without = prev.filter((p) => p.id !== paused.id);
          return [paused, ...without];
        });
      }
      setMessage("הקמפיין שוכפל כטיוטה מושהית — לחצו ערוך כדי להפעיל");
      onEdit?.(data.post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שכפול נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function discardCampaign(post: ScheduledPostDTO) {
    if (
      !window.confirm(
        `למחוק את הקמפיין "${post.name || "ללא שם"}"? כל הריצות העתידיות יבוטלו.`
      )
    ) {
      return;
    }
    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        success: boolean;
        post?: ScheduledPostDTO;
        deleted?: boolean;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "מחיקה נכשלה");
      }
      notifyExtensionCancel(post.id);
      if (data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === data.post!.id ? data.post! : p))
        );
      } else {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
      }
      setMessage("הקמפיין בוטל ונמחק מהתזמון");
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  async function liveUpdate(post: ScheduledPostDTO, mode: "text" | "replace_repost") {
    if (!post.publishedPosts.some((p) => p.status === "live" || p.status === "updated")) {
      setError("אין פוסטים חיים שמורים — יש לפרסם קודם לקבוצות דרך DISTRO");
      return;
    }
    if (
      mode === "replace_repost" &&
      !window.confirm(
        "פעולה זו תמחק את הפוסטים הישנים ותפרסם מחדש עם התמונה הנוכחית. להמשיך?"
      )
    ) {
      return;
    }

    setBusyId(post.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}/live-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          content: post.content,
          imageUrl: post.imageUrl || undefined,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        job?: {
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
        post?: ScheduledPostDTO;
      };
      if (!res.ok || !data.success || !data.job) {
        throw new Error(data.error || "הכנת עדכון חי נכשלה");
      }
      if (data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === data.post!.id ? data.post! : p))
        );
      }
      notifyExtensionLiveUpdate({
        scheduledPostId: post.id,
        ...data.job,
      });
      setMessage(
        mode === "text"
          ? "נשלח לעדכון טקסט בכל הקבוצות דרך התוסף"
          : "נשלח למחיקה ופרסום מחדש עם תמונות חדשות"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "עדכון חי נכשל");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            פוסטים פעילים וקמפיינים
          </h2>
          <p className="text-sm text-slate-500">
            עריכה, השהיה ומחיקה של קמפיינים מתוזמנים — ועדכון פוסטים שכבר פורסמו
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          רענון
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען קמפיינים…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          אין קמפיינים בתצוגה זו.{" "}
          <button
            type="button"
            onClick={() => onCreateNew?.()}
            className="font-semibold text-[#1877f2] hover:underline"
          >
            צרו קמפיין חדש
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((campaign) => {
            const busy = busyId === campaign.id;
            const paused = campaign.status === "paused";
            const liveCount = campaign.publishedPosts.filter(
              (p) => p.status === "live" || p.status === "updated"
            ).length;
            return (
              <div
                key={campaign.id}
                className="mb-4 rounded-xl border border-[#e4e6eb] bg-white p-4 text-right shadow-sm"
                dir="rtl"
              >
                <div className="flex items-center justify-between gap-3 border-b border-[#e4e6eb] pb-3">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-[#050505]">
                      {campaign.name || "קמפיין ללא שם"}
                    </span>
                    <span
                      className={cn(
                        "mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        paused
                          ? "bg-amber-100 text-amber-700"
                          : campaign.status === "pending" && campaign.isActive
                            ? "bg-yellow-100 text-yellow-800"
                            : campaign.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                      )}
                    >
                      {paused
                        ? "מושהה"
                        : campaign.isActive
                          ? `${cadenceLabelHe(campaign)} • ${campaign.targetGroups.length} קבוצות`
                          : statusLabelHe(campaign.status)}
                    </span>
                    <span
                      className={cn(
                        "mr-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        statusTone(campaign.status)
                      )}
                    >
                      {statusLabelHe(campaign.status)}
                      {campaign.runsCount > 0
                        ? ` · ${campaign.runsCount} ריצות`
                        : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onEdit
                          ? onEdit(campaign.id)
                          : (window.location.href = `/dashboard/compose?edit=${campaign.id}`)
                      }
                      className="flex items-center gap-1.5 rounded-lg bg-[#f0f2f5] px-3 py-1.5 text-xs font-semibold text-[#050505] transition-colors hover:bg-[#e4e6eb]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      ערוך הכל
                    </button>
                    {(campaign.status === "pending" ||
                      campaign.status === "running" ||
                      campaign.status === "paused") && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void togglePause(campaign)}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
                      >
                        {paused ? (
                          <Play className="h-3.5 w-3.5" />
                        ) : (
                          <Pause className="h-3.5 w-3.5" />
                        )}
                        {paused ? "הפעל" : "השהה"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void duplicateCampaign(campaign)}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      שכפל
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void discardCampaign(campaign)}
                      className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      מחק
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex gap-4">
                  {campaign.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={campaign.imageUrl}
                      alt=""
                      className="h-20 w-20 rounded-lg border border-[#e4e6eb] object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1 text-xs text-[#65676b] line-clamp-3 whitespace-pre-wrap">
                    {campaign.content}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e4e6eb] pt-3">
                  <span className="text-[11px] text-slate-500">
                    {campaign.targetGroups.length} קבוצות יעד
                    {liveCount > 0 ? ` · ${liveCount} פוסטים חיים` : ""}
                  </span>
                  <div className="mr-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || liveCount === 0}
                      onClick={() => void liveUpdate(campaign, "text")}
                      className="rounded-lg bg-[#e7f3ff] px-3 py-1.5 text-xs font-semibold text-[#1877f2] transition-colors hover:bg-[#d8ebff] disabled:opacity-40"
                      title={
                        liveCount === 0
                          ? "יופיע לאחר פרסום ראשון לקבוצות"
                          : undefined
                      }
                    >
                      עדכן טקסט בכל הקבוצות
                    </button>
                    <button
                      type="button"
                      disabled={busy || liveCount === 0 || !campaign.imageUrl}
                      onClick={() =>
                        void liveUpdate(campaign, "replace_repost")
                      }
                      className="rounded-lg bg-[#f0f2f5] px-3 py-1.5 text-xs font-semibold text-[#050505] transition-colors hover:bg-[#e4e6eb] disabled:opacity-40"
                    >
                      מחק ופרסם מחדש עם תמונות חדשות
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
