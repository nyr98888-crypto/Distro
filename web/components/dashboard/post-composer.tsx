"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  detectPriority,
  priorityBadgeLabel,
  type PriorityResult,
} from "@/lib/priority-detector";
import type { ChannelDTO } from "@/lib/channels-shared";

type PostComposerProps = {
  channels: ChannelDTO[];
  accountId: string | null;
};

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PostComposer({ channels, accountId }: PostComposerProps) {
  const [name, setName] = React.useState("");
  const [content, setContent] = React.useState("");
  const [timeSensitive, setTimeSensitive] = React.useState(false);
  const [eventTimeLocal, setEventTimeLocal] = React.useState(() =>
    toDatetimeLocalValue(new Date(Date.now() + 90 * 60 * 1000))
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const detection: PriorityResult = React.useMemo(() => {
    const eventIso =
      timeSensitive && eventTimeLocal
        ? datetimeLocalToIso(eventTimeLocal)
        : null;
    return detectPriority(content, eventIso);
  }, [content, timeSensitive, eventTimeLocal]);

  const activeChannels = React.useMemo(
    () => channels.filter((c) => c.isActive),
    [channels]
  );

  const toggleChannel = React.useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectAll = React.useCallback(() => {
    setSelectedIds(new Set(activeChannels.map((c) => c.id)));
  }, [activeChannels]);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accountId) {
      setError("התחברו כמשתמש בדיקה לפני שליחה לתור.");
      return;
    }
    if (!name.trim() || !content.trim()) {
      setError("יש למלא כותרת ותוכן.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("יש לבחור לפחות קבוצה אחת.");
      return;
    }

    setPending(true);
    try {
      const eventTime =
        timeSensitive && eventTimeLocal
          ? datetimeLocalToIso(eventTimeLocal)
          : null;

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          rawContent: content.trim(),
          channelIds: [...selectedIds],
          eventTime,
          schedule: true,
        }),
      });

      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        campaign?: { id: string };
        priority?: PriorityResult;
        queued?: number;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "יצירת הקמפיין נכשלה");
      }

      setSuccess(
        `הקמפיין נכנס לתור (${data.queued ?? 0} משימות) — ${priorityBadgeLabel(data.priority?.priority ?? detection.priority)}`
      );
      setName("");
      setContent("");
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "השליחה נכשלה");
    } finally {
      setPending(false);
    }
  }

  const badgeVariant =
    detection.priority === 1
      ? "destructive"
      : detection.priority === 2
        ? "default"
        : "secondary";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">עורך פוסט</h2>
          <p className="text-sm text-muted-foreground">
            כתבו פעם אחת — פרסמו לקבוצות נבחרות עם עדיפות אוטומטית.
          </p>
        </div>
        <Badge variant={badgeVariant} className="text-sm">
          {priorityBadgeLabel(detection.priority)}
        </Badge>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign-name">כותרת קמפיין</Label>
        <Input
          id="campaign-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: ערב משחק הערב"
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign-content">תוכן הפוסט</Label>
        <textarea
          id="campaign-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'כתבו את הפוסט… (נסו "דחוף" או "חסר שחקן")'}
          disabled={pending}
          rows={8}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">{detection.reason}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="time-sensitive">פוסט דחוף / מוגבל בזמן</Label>
            <p className="text-xs text-muted-foreground">
              אם האירוע בתוך 3 שעות — העדיפות תהפוך לפלאש.
            </p>
          </div>
          <Switch
            id="time-sensitive"
            checked={timeSensitive}
            onCheckedChange={setTimeSensitive}
            disabled={pending}
          />
        </div>

        {timeSensitive && (
          <div className="space-y-2">
            <Label htmlFor="event-time">תאריך ושעת האירוע</Label>
            <Input
              id="event-time"
              type="datetime-local"
              value={eventTimeLocal}
              onChange={(e) => setEventTimeLocal(e.target.value)}
              disabled={pending}
              className="max-w-xs"
              dir="ltr"
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>קבוצות יעד</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={selectAll}
              disabled={pending || activeChannels.length === 0}
            >
              בחר הכל
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={pending || selectedIds.size === 0}
            >
              נקה
            </Button>
          </div>
        </div>

        {activeChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            אין קבוצות פעילות זמינות.
          </p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border p-3">
            {activeChannels.map((ch) => {
              const checked = selectedIds.has(ch.id);
              return (
                <li key={ch.id} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    id={`ch-${ch.id}`}
                    checked={checked}
                    onCheckedChange={(value) => {
                      toggleChannel(ch.id, !!value);
                    }}
                    disabled={pending}
                  />
                  <label
                    htmlFor={`ch-${ch.id}`}
                    className="flex flex-1 cursor-pointer items-center justify-between gap-2"
                  >
                    <span className="font-medium text-foreground">
                      {ch.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {ch.memberCount.toLocaleString("he-IL")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          {success}
        </p>
      )}

      <Button type="submit" disabled={pending || !accountId}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        שגר לתור הפצה
      </Button>
    </form>
  );
}
