"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  Users,
  X,
  Loader2,
} from "lucide-react";
import type { ChannelDTO } from "@/lib/channels-shared";
import { CampaignWizard } from "@/components/dashboard/campaign-wizard";
import { ContentCalendar } from "@/components/dashboard/content-calendar";
import {
  HE_WEEKDAY_LABELS,
} from "@/lib/schedule-engine";
import {
  notifyExtensionCancel,
  notifyExtensionSchedule,
} from "@/lib/extension-bridge";
import type { ScheduledPostDTO } from "@/lib/scheduled-posts";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { asArray, safeJson } from "@/lib/safe";
import { cn } from "@/lib/utils";

type ViewMode = "table" | "calendar";

type CampaignsDashboardProps = {
  channels: ChannelDTO[];
  accountId: string | null;
  userName: string;
  avatarUrl?: string;
};

function statusPill(
  post: ScheduledPostDTO,
  t: (key: TranslationKey) => string
): {
  label: string;
  className: string;
} {
  if (post.status === "paused" || (!post.isActive && post.status !== "completed")) {
    if (post.status === "paused") {
      return {
        label: t("statusPaused"),
        className: "bg-slate-100 text-[#64748B]",
      };
    }
  }
  if (post.status === "completed" || post.status === "cancelled") {
    return {
      label: t("statusCompleted"),
      className: "bg-slate-100 text-slate-500",
    };
  }
  if (post.status === "running") {
    return {
      label: t("statusPending"),
      className: "bg-amber-50 text-[#F59E0B]",
    };
  }
  if (post.scheduleType === "recurring" && post.isActive) {
    return {
      label: t("statusActive"),
      className: "bg-emerald-50 text-[#10B981]",
    };
  }
  if (post.status === "pending" && post.isActive) {
    return {
      label: t("statusScheduled"),
      className: "bg-amber-50 text-[#F59E0B]",
    };
  }
  if (post.status === "failed") {
    return {
      label: t("statusPending"),
      className: "bg-amber-50 text-[#F59E0B]",
    };
  }
  return {
    label: t("statusPending"),
    className: "bg-amber-50 text-[#F59E0B]",
  };
}

function ScheduleCell({ post }: { post: ScheduledPostDTO }) {
  const days = Array.isArray(post?.daysOfWeek) ? post.daysOfWeek : [];
  if (post?.scheduleType === "recurring") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {days.map((d) => (
          <span
            key={d}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-700"
          >
            {HE_WEEKDAY_LABELS[d] ?? d}׳
          </span>
        ))}
        <span className="mr-1 text-xs font-medium text-slate-600" dir="ltr">
          {post.runTime || "07:00"}
        </span>
      </div>
    );
  }
  if (post?.scheduleType === "immediate") {
    return <span className="text-xs text-slate-600">פרסום מיידי</span>;
  }
  const when = post?.nextRunAt || post?.scheduledTime;
  let label = "—";
  if (when) {
    try {
      label = new Date(when).toLocaleString("he-IL");
    } catch {
      label = "—";
    }
  }
  return <span className="text-xs text-slate-600">{label}</span>;
}

export function CampaignsDashboard({
  channels: initialChannelsProp,
  accountId,
  userName,
  avatarUrl = "",
}: CampaignsDashboardProps) {
  // All hooks must run unconditionally at the top (React #310).
  const { t, dir } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialChannels = Array.isArray(initialChannelsProp)
    ? initialChannelsProp
    : [];
  const [posts, setPosts] = React.useState<ScheduledPostDTO[]>([]);
  const [channels, setChannels] = React.useState<ChannelDTO[]>(initialChannels);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<ViewMode>("table");
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [initialScheduleTime, setInitialScheduleTime] = React.useState<
    string | null
  >(null);
  const [initialWizardStep, setInitialWizardStep] = React.useState<1 | 2 | 3>(1);
  const [wizardKey, setWizardKey] = React.useState(0);
  const [menuId, setMenuId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [syncingGroups, setSyncingGroups] = React.useState(false);
  const [runningScheduler, setRunningScheduler] = React.useState(false);
  const [liveGroupCount, setLiveGroupCount] = React.useState(
    () => initialChannels.filter((c) => c?.isActive).length
  );

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [postsRes, profileRes, channelsRes] = await Promise.all([
        fetch("/api/scheduled-posts").catch(() => null),
        fetch("/api/facebook/profile").catch(() => null),
        fetch("/api/channels").catch(() => null),
      ]);
      const data = await safeJson<{
        success?: boolean;
        posts?: ScheduledPostDTO[];
        error?: string;
      }>(postsRes);
      // New / empty accounts: treat missing or failed payloads as empty lists.
      setPosts(asArray(data?.posts));
      if (postsRes && (!postsRes.ok || data?.success === false)) {
        if (!opts?.silent) {
          setError(data?.error || "טעינה נכשלה");
        }
      }

      const chData = await safeJson<{
        success?: boolean;
        channels?: ChannelDTO[];
      }>(channelsRes);
      const nextChannels = asArray(chData?.channels);
      setChannels(nextChannels);
      setLiveGroupCount(
        nextChannels.filter((c) => c?.isActive !== false).length
      );

      const profileData = await safeJson<{
        success?: boolean;
        profile?: { groupCount?: number } | null;
      }>(profileRes);
      if (
        profileData?.success &&
        typeof profileData.profile?.groupCount === "number"
      ) {
        setLiveGroupCount(profileData.profile.groupCount);
      }
    } catch (err) {
      setPosts([]);
      setChannels([]);
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : "שגיאה");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const onFocus = () => void load({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  React.useEffect(() => {
    const openNew = searchParams.get("new") === "1";
    const edit = searchParams.get("edit");
    const date = searchParams.get("date");
    if (openNew) {
      openCreate(date);
      router.replace("/dashboard/campaigns");
    } else if (edit) {
      openEdit(edit);
      router.replace("/dashboard/campaigns");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  React.useEffect(() => {
    function onDocClick() {
      setMenuId(null);
    }
    if (menuId) {
      document.addEventListener("click", onDocClick);
      return () => document.removeEventListener("click", onDocClick);
    }
  }, [menuId]);

  function openCreate(scheduleTime?: string | null) {
    setEditId(null);
    const timed =
      typeof scheduleTime === "string" && scheduleTime.trim().length > 0;
    setInitialScheduleTime(timed ? scheduleTime! : null);
    setInitialWizardStep(timed ? 3 : 1);
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
  }

  function openEdit(id: string) {
    setEditId(id);
    setInitialScheduleTime(null);
    setInitialWizardStep(1);
    setWizardKey((k) => k + 1);
    setWizardOpen(true);
    setMenuId(null);
  }

  function closeWizard() {
    setWizardOpen(false);
    setEditId(null);
    setInitialScheduleTime(null);
    setInitialWizardStep(1);
  }

  const safePosts = Array.isArray(posts) ? posts : [];
  const safeChannels = Array.isArray(channels) ? channels : [];
  const groupCount = Number(liveGroupCount) || 0;
  const publishedCount = safePosts.reduce(
    (sum, p) => sum + (Number(p?.runsCount) || 0),
    0
  );
  const scheduledCount = safePosts.filter(
    (p) =>
      p?.isActive &&
      (p?.status === "pending" || p?.status === "running")
  ).length;

  // Plain derivation (no useMemo) — safer with useSearchParams suspend/resume.
  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return safePosts;
    return safePosts.filter((p) => {
      const groups = Array.isArray(p?.targetGroups) ? p.targetGroups : [];
      const hay = [
        p?.name || "",
        p?.content || "",
        ...groups.map((g) => g?.name || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  })();

  async function patchCampaign(id: string, body: Record<string, unknown>) {
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
    setPosts((prev) => prev.map((p) => (p.id === data.post!.id ? data.post! : p)));
    return data.post;
  }

  async function togglePause(post: ScheduledPostDTO) {
    setBusyId(post.id);
    setMenuId(null);
    try {
      const pausing = post.status !== "paused" && post.isActive;
      const updated = await patchCampaign(
        post.id,
        pausing
          ? { status: "paused", isActive: false }
          : { status: "pending", isActive: true }
      );
      if (pausing) notifyExtensionCancel(updated.id);
      else notifyExtensionSchedule(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "השהיה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(post: ScheduledPostDTO) {
    setBusyId(post.id);
    setMenuId(null);
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
          executionMode: post.executionMode,
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
      setPosts((prev) => [paused, ...prev.filter((p) => p.id !== paused.id)]);
      openEdit(paused.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שכפול נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function discard(post: ScheduledPostDTO) {
    if (!window.confirm(`למחוק את "${post.name || "הקמפיין"}"?`)) return;
    setBusyId(post.id);
    setMenuId(null);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "מחיקה נכשלה");
      notifyExtensionCancel(post.id);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, status: "cancelled", isActive: false, nextRunAt: null }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "מחיקה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  const safeUserName = typeof userName === "string" ? userName : "";
  const displayName = safeUserName.includes("@")
    ? safeUserName.split("@")[0]
    : safeUserName || "—";

  return (
    <div className="mx-auto max-w-6xl space-y-6" dir={dir}>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-12 w-12 rounded-full border border-slate-200 object-cover bg-slate-100"
            />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {t("welcome", { name: displayName })}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{t("welcomeSubtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <button
            type="button"
            disabled={runningScheduler}
            onClick={() => {
              setRunningScheduler(true);
              setError(null);
              void (async () => {
                try {
                  const res = await fetch("/api/campaigns/run", {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = (await res.json().catch(() => null)) as {
                    success?: boolean;
                    error?: string;
                    processed?: number;
                  } | null;
                  if (!res.ok || !data?.success) {
                    throw new Error(
                      data?.error ||
                        (dir === "rtl"
                          ? "הפעלת התזמון נכשלה"
                          : "Scheduler run failed")
                    );
                  }
                  await load({ silent: true });
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : dir === "rtl"
                        ? "הפעלת התזמון נכשלה"
                        : "Scheduler run failed"
                  );
                } finally {
                  setRunningScheduler(false);
                }
              })();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:opacity-60"
          >
            {runningScheduler ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {dir === "rtl" ? "הפעל תזמון עכשיו" : "Run Scheduler Now"}
          </button>
          <button
            type="button"
            disabled={syncingGroups}
            onClick={() => {
              setSyncingGroups(true);
              setError(null);
              void (async () => {
                try {
                  const res = await fetch("/api/groups/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ seedIfEmpty: true }),
                  });
                  const data = (await res.json().catch(() => null)) as {
                    success?: boolean;
                    error?: string;
                    needsReauth?: boolean;
                  } | null;
                  if (!res.ok || !data?.success) {
                    if (data?.needsReauth) {
                      window.location.href =
                        "/api/auth/facebook?callbackUrl=%2Fdashboard%2Fchannels";
                      return;
                    }
                    throw new Error(
                      data?.error ||
                        (dir === "rtl"
                          ? "סנכרון קבוצות נכשל"
                          : "Group sync failed")
                    );
                  }
                  await load({ silent: true });
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : dir === "rtl"
                        ? "סנכרון קבוצות נכשל"
                        : "Group sync failed"
                  );
                } finally {
                  setSyncingGroups(false);
                }
              })();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            {syncingGroups ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("syncGroups")}
          </button>
          <Link
            href="/dashboard/calendar"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <CalendarDays className="h-4 w-4" />
            {t("calendarCta")}
          </Link>
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1D4ED8]"
          >
            <Plus className="h-4 w-4" />
            {t("newCampaign")}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: t("statGroups"),
            value: groupCount,
            icon: Users,
            tone: "text-[#2563EB] bg-[#EFF6FF]",
          },
          {
            label: t("statPublished"),
            value: publishedCount,
            icon: CheckCircle2,
            tone: "text-[#10B981] bg-emerald-50",
          },
          {
            label: t("statScheduled"),
            value: scheduledCount,
            icon: Clock3,
            tone: "text-[#F59E0B] bg-amber-50",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
            >
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  stat.tone
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">
                  {stat.value.toLocaleString("he-IL")}
                </div>
                <div className="text-xs font-medium text-slate-500">
                  {stat.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchCampaigns")}
            className="w-full rounded-xl border border-transparent bg-slate-50 py-2.5 pe-10 ps-3 text-sm outline-none focus:border-[#3B82F6] focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "table"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            )}
          >
            <Table2 className="h-3.5 w-3.5" />
            {t("viewTable")}
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              view === "calendar"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t("viewCalendar")}
          </button>
        </div>
      </div>

      {view === "calendar" ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <ContentCalendar onCreateForDate={(date) => openCreate(date)} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 font-semibold"> </th>
                  <th className="px-4 py-3 font-semibold">{t("colCampaign")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colStatus")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colSchedule")}</th>
                  <th className="px-4 py-3 font-semibold">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      {t("loading")}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-16 text-center text-slate-400"
                    >
                      {t("emptyCampaigns")}{" "}
                      <button
                        type="button"
                        onClick={() => openCreate()}
                        className="font-semibold text-[#2563EB] hover:underline"
                      >
                        {t("createFirst")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  filtered.map((post) => {
                    const pill = statusPill(post, t);
                    const photoCount = post.imageUrl ? 1 : 0;
                    return (
                      <tr
                        key={post.id}
                        className="border-b border-slate-50 transition hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            {post.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={post.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                                אין
                              </div>
                            )}
                            {photoCount > 1 && (
                              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px] font-bold text-white">
                                +{photoCount - 1}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {post.name || "ללא שם"}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {(post.targetGroups || []).length} קבוצות יעד
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              pill.className
                            )}
                          >
                            {pill.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ScheduleCell post={post} />
                        </td>
                        <td className="relative px-4 py-3">
                          <button
                            type="button"
                            disabled={busyId === post.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuId((id) =>
                                id === post.id ? null : post.id
                              );
                            }}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            aria-label="פעולות"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {menuId === post.id && (
                            <div
                              className="absolute left-4 top-10 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-right shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => openEdit(post.id)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                ערוך קמפיין
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => void duplicate(post)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                שכפל
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                onClick={() => void togglePause(post)}
                              >
                                {post.status === "paused" ? (
                                  <Play className="h-3.5 w-3.5" />
                                ) : (
                                  <Pause className="h-3.5 w-3.5" />
                                )}
                                {post.status === "paused" ? "הפעל" : "השהה"}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                                onClick={() => void discard(post)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                מחק
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit wizard modal */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="סגור"
            onClick={closeWizard}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-bold text-slate-900">
                {editId ? t("wizardEdit") : t("wizardNew")}
              </h2>
              <button
                type="button"
                onClick={closeWizard}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-none max-h-[90vh] overflow-y-auto px-4 py-4 sm:px-5">
              <CampaignWizard
                key={wizardKey}
                channels={safeChannels}
                accountId={accountId}
                editPostId={editId}
                initialScheduleTime={initialScheduleTime}
                initialStep={initialWizardStep}
                onSaved={() => {
                  closeWizard();
                  void load();
                }}
                onCancelEdit={closeWizard}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
