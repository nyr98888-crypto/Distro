"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  statusLabelHe,
  statusTone,
  toDatetimeLocalValue,
  type ScheduledPostDTO,
} from "@/lib/scheduled-posts";
import { expandScheduleOccurrences } from "@/lib/schedule-engine";
import {
  notifyExtensionCancel,
  notifyExtensionSchedule,
} from "@/lib/extension-bridge";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week";

type CalendarCard = ScheduledPostDTO & {
  occurrenceAt: string;
  isVirtualOccurrence?: boolean;
};

const HE_DAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function buildMonthCells(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const gridStart = startOfWeek(first);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    cells.push(cell);
  }
  return cells;
}

function buildWeekCells(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

type ContentCalendarProps = {
  /** When set, day clicks open the campaign wizard for that date instead of navigating away. */
  onCreateForDate?: (datetimeLocal: string) => void;
};

function badgeTone(post: CalendarCard): string {
  if (post.scheduleType === "recurring") {
    return "bg-violet-500 text-white";
  }
  if (post.status === "pending" || post.status === "running") {
    return "bg-sky-500 text-white";
  }
  if (post.status === "completed") {
    return "bg-emerald-500 text-white";
  }
  if (post.status === "failed") {
    return "bg-rose-500 text-white";
  }
  return "bg-amber-500 text-white";
}

export function ContentCalendar({ onCreateForDate }: ContentCalendarProps) {
  const [view, setView] = React.useState<ViewMode>("month");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [posts, setPosts] = React.useState<ScheduledPostDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<CalendarCard | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

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
        throw new Error(data.error || "טעינת התזמונים נכשלה");
      }
      setPosts(data.posts || []);
      for (const post of data.posts || []) {
        if (post.status === "pending" && post.isActive) {
          notifyExtensionSchedule(post);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const { cells, rangeStart, rangeEnd } = React.useMemo(() => {
    const nextCells =
      view === "month" ? buildMonthCells(anchor) : buildWeekCells(anchor);
    const start = nextCells[0] ? new Date(nextCells[0]) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = nextCells[nextCells.length - 1]
      ? new Date(nextCells[nextCells.length - 1])
      : new Date();
    end.setHours(23, 59, 59, 999);
    return { cells: nextCells, rangeStart: start, rangeEnd: end };
  }, [view, anchor]);

  const postsByDay = React.useMemo(() => {
    const map = new Map<string, CalendarCard[]>();

    for (const post of posts) {
      if (post.status === "cancelled" || post.status === "paused") continue;

      if (post.scheduleType === "recurring" && post.isActive) {
        const occurrences = expandScheduleOccurrences(
          {
            id: post.id,
            scheduleType: "recurring",
            daysOfWeek: post.daysOfWeek,
            runTime: post.runTime,
            endDate: post.endDate,
            maxRuns: post.maxRuns,
            runsCount: post.runsCount,
            isActive: post.isActive,
          },
          rangeStart,
          rangeEnd
        );
        for (const occ of occurrences) {
          const key = `${occ.at.getFullYear()}-${occ.at.getMonth()}-${occ.at.getDate()}`;
          const list = map.get(key) || [];
          list.push({
            ...post,
            occurrenceAt: occ.at.toISOString(),
            isVirtualOccurrence: true,
          });
          map.set(key, list);
        }
        continue;
      }

      const d = new Date(post.nextRunAt || post.scheduledTime);
      if (d < rangeStart || d > rangeEnd) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) || [];
      list.push({
        ...post,
        occurrenceAt: d.toISOString(),
        isVirtualOccurrence: false,
      });
      map.set(key, list);
    }

    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.occurrenceAt).getTime() -
          new Date(b.occurrenceAt).getTime()
      );
    }
    return map;
  }, [posts, rangeStart, rangeEnd]);

  function shift(dir: number) {
    setAnchor((prev) => {
      const next = new Date(prev);
      if (view === "month") next.setMonth(next.getMonth() + dir);
      else next.setDate(next.getDate() + dir * 7);
      return next;
    });
  }

  function dayKey(d: Date) {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  async function cancelPost(post: CalendarCard) {
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "ביטול נכשל");
      }
      notifyExtensionCancel(post.id);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ביטול נכשל");
    } finally {
      setBusyId(null);
    }
  }

  async function togglePause(post: CalendarCard) {
    setBusyId(post.id);
    try {
      const pausing = post.status !== "paused" && post.isActive;
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          pausing
            ? { status: "paused", isActive: false }
            : { status: "pending", isActive: true }
        ),
      });
      const data = (await res.json()) as {
        success: boolean;
        post?: ScheduledPostDTO;
        error?: string;
      };
      if (!res.ok || !data.success || !data.post) {
        throw new Error(data.error || "השהיה נכשלה");
      }
      if (pausing) notifyExtensionCancel(data.post.id);
      else notifyExtensionSchedule(data.post);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "השהיה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  const today = new Date();

  return (
    <div className="space-y-4 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => shift(1)}
            aria-label="הבא"
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="min-w-[10rem] text-center text-lg font-semibold capitalize">
            {monthLabel(anchor)}
          </h2>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => shift(-1)}
            aria-label="הקודם"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAnchor(new Date())}
          >
            היום
          </Button>
        </div>

        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setView("month")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              view === "month"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            חודש
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              view === "week"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            שבוע
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          טוען לוח תזמונים…
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
            "grid-cols-7"
          )}
        >
          {HE_DAYS.map((d) => (
            <div
              key={d}
              className="bg-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-600"
            >
              {d}
            </div>
          ))}

          {cells.map((day) => {
            const inMonth = day.getMonth() === anchor.getMonth();
            const key = dayKey(day);
            const dayPosts = postsByDay.get(key) || [];
            const isToday = sameDay(day, today);
            const dateLocal = toDatetimeLocalValue(
              new Date(
                day.getFullYear(),
                day.getMonth(),
                day.getDate(),
                12,
                0
              )
            );
            const createHref = `/dashboard/campaigns?new=1&date=${encodeURIComponent(dateLocal)}`;

            function openCreateForDay() {
              if (onCreateForDate) {
                onCreateForDate(dateLocal);
                return;
              }
              window.location.assign(createHref);
            }

            return (
              <div
                key={key + String(day.getTime())}
                role="button"
                tabIndex={0}
                onClick={openCreateForDay}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openCreateForDay();
                  }
                }}
                title="צור קמפיין לתאריך זה"
                className={cn(
                  "min-h-[110px] cursor-pointer bg-white p-1.5 transition hover:bg-sky-50/60 sm:min-h-[130px]",
                  view === "week" && "min-h-[180px]",
                  !inMonth && view === "month" && "bg-slate-50 text-slate-400 hover:bg-sky-50/40"
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                      isToday && "bg-sky-600 text-white"
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {dayPosts.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {dayPosts.slice(0, view === "week" ? 8 : 4).map((post) => (
                    <button
                      key={`${post.id}-${post.occurrenceAt}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(post);
                      }}
                      className={cn(
                        "max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm transition hover:brightness-95",
                        badgeTone(post)
                      )}
                      title={`${formatTime(post.occurrenceAt)} · ${post.name || post.content}`}
                    >
                      {formatTime(post.occurrenceAt)}
                      {post.scheduleType === "recurring" ? " ↻" : ""}
                      {" · "}
                      {(post.name || post.content || "קמפיין").slice(0, 18)}
                    </button>
                  ))}
                  {dayPosts.length > (view === "week" ? 8 : 4) && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayPosts.length - (view === "week" ? 8 : 4)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="סגור"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selected.name || "פוסט מתוזמן"}
                </h3>
                <p className="mt-1 text-sm text-slate-500" dir="ltr">
                  {new Date(selected.occurrenceAt).toLocaleString("he-IL")}
                </p>
                {selected.scheduleType === "recurring" && (
                  <p className="mt-1 text-xs text-sky-700">
                    קמפיין מחזורי · {selected.runsCount} ריצות עד כה
                    {selected.maxRuns != null
                      ? ` / מקס׳ ${selected.maxRuns}`
                      : ""}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setSelected(null)}
              >
                <X className="size-4" />
              </Button>
            </div>

            <Badge
              className={cn("mb-3 border", statusTone(selected.status))}
              variant="outline"
            >
              {statusLabelHe(selected.status)}
            </Badge>

            <p className="mb-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
              {selected.content}
            </p>

            <p className="mb-4 text-sm text-slate-600">
              יעדים: {selected.targetGroups.length} קבוצות · השהייה{" "}
              {selected.delaySeconds} שנ׳
            </p>
            <ul className="mb-4 max-h-32 space-y-1 overflow-auto text-xs text-slate-600">
              {selected.targetGroups.map((g) => (
                <li key={g.id}>• {g.name}</li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/dashboard/compose?edit=${selected.id}`}>
                  <Pencil className="size-3.5" />
                  ערוך פוסט
                </Link>
              </Button>
              {(selected.status === "pending" ||
                selected.status === "running" ||
                selected.status === "paused") && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === selected.id}
                  onClick={() => void togglePause(selected)}
                >
                  {selected.status === "paused" ? (
                    <Play className="size-3.5" />
                  ) : (
                    <Pause className="size-3.5" />
                  )}
                  {selected.status === "paused" ? "הפעל" : "השהה זמנית"}
                </Button>
              )}
              {(selected.status === "pending" ||
                selected.status === "running" ||
                selected.status === "paused") && (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busyId === selected.id}
                  onClick={() => void cancelPost(selected)}
                >
                  {busyId === selected.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  בטל ומחק
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/campaigns">ניהול קמפיינים</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
