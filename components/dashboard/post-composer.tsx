"use client";

import * as React from "react";
import { Link2, Loader2, PenLine, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FacebookComposer,
  type FacebookComposerData,
  type FacebookComposerSeed,
} from "@/components/dashboard/facebook-composer";
import { TargetGroupsSelector } from "@/components/dashboard/target-groups-selector";
import {
  detectPriority,
  priorityBadgeLabel,
  type PriorityResult,
} from "@/lib/priority-detector";
import type { ChannelDTO } from "@/lib/channels-shared";
import { cn } from "@/lib/utils";
import {
  appendWhatsAppLink,
  buildWhatsAppMeUrl,
  DEFAULT_WHATSAPP_MESSAGE,
} from "@/lib/whatsapp";
import { notifyExtensionSchedule } from "@/lib/extension-bridge";
import type { ScheduledPostDTO } from "@/lib/scheduled-posts";

type PostComposerProps = {
  channels: ChannelDTO[];
  accountId: string | null;
  /** Prefill schedule from calendar deep-link (datetime-local string) */
  initialScheduleTime?: string | null;
  editPostId?: string | null;
};

type Mode = "create" | "import";

function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export function PostComposer({
  channels,
  accountId,
  initialScheduleTime = null,
  editPostId = null,
}: PostComposerProps) {
  const [mode, setMode] = React.useState<Mode>("create");
  const [name, setName] = React.useState("");
  const [importUrl, setImportUrl] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [seed, setSeed] = React.useState<FacebookComposerSeed | null>(() =>
    initialScheduleTime
      ? { scheduleTime: initialScheduleTime, openTiming: true, text: "" }
      : null
  );
  const [seedKey, setSeedKey] = React.useState(() =>
    initialScheduleTime ? 1 : 0
  );
  const [editingId, setEditingId] = React.useState<string | null>(
    editPostId
  );
  const [existingImageUrl, setExistingImageUrl] = React.useState<string>("");
  const [composer, setComposer] = React.useState<FacebookComposerData>({
    text: "",
    image: null,
    hasImage: false,
    scheduleTime: "",
    intervalDelay: 60,
    scheduleType: "once",
    daysOfWeek: [6],
    runTime: "07:00",
    endMode: "never",
    endDate: "",
    maxRuns: 10,
    whatsappEnabled: false,
    whatsappPhone: "",
    whatsappMessage: DEFAULT_WHATSAPP_MESSAGE,
  });
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const detection: PriorityResult = React.useMemo(() => {
    const eventIso = composer.scheduleTime
      ? datetimeLocalToIso(composer.scheduleTime)
      : null;
    return detectPriority(composer.text, eventIso);
  }, [composer.text, composer.scheduleTime]);

  const activeChannels = React.useMemo(
    () => channels.filter((c) => c.isActive),
    [channels]
  );

  React.useEffect(() => {
    if (!editPostId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/scheduled-posts/${editPostId}`);
        const data = (await res.json()) as {
          success: boolean;
          post?: ScheduledPostDTO;
        };
        if (!res.ok || !data.success || !data.post || cancelled) return;
        const post = data.post;
        setName(post.name || "");
        setSelectedIds(new Set(post.targetGroups.map((g) => g.id)));
        setEditingId(post.id);
        setExistingImageUrl(post.imageUrl || "");
        const local = (() => {
          const source = post.nextRunAt || post.scheduledTime;
          const d = new Date(source);
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })();
        const endMode =
          post.maxRuns != null
            ? "max_runs"
            : post.endDate
              ? "end_date"
              : "never";
        const endDateLocal = post.endDate
          ? post.endDate.slice(0, 10)
          : "";
        setSeed({
          text: post.content,
          imageDataUrl: post.imageUrl || null,
          scheduleTime: local,
          scheduleType: post.scheduleType,
          daysOfWeek: post.daysOfWeek.length ? post.daysOfWeek : [6],
          runTime: post.runTime || "07:00",
          intervalDelay: post.delaySeconds || 60,
          endMode,
          endDate: endDateLocal,
          maxRuns: post.maxRuns ?? 10,
          openTiming: true,
        });
        setSeedKey((k) => k + 1);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editPostId]);

  async function handleImport(e?: React.FormEvent) {
    e?.preventDefault();
    setImportError(null);
    setError(null);
    setSuccess(null);

    const url = importUrl.trim();
    if (!url) {
      setImportError("הדביקו קישור לפוסט בפייסבוק");
      return;
    }

    setImporting(true);
    try {
      const res = await fetch("/api/posts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as {
        success: boolean;
        error?: string;
        text?: string;
        imageDataUrl?: string | null;
      };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? "ייבוא הפוסט נכשל");
      }

      const nextSeed: FacebookComposerSeed = {
        text: data.text || "",
        imageDataUrl: data.imageDataUrl || null,
      };
      setSeed(nextSeed);
      setSeedKey((k) => k + 1);

      if (!name.trim()) {
        const snippet = (data.text || "פוסט מיובא").slice(0, 60);
        setName(`ייבוא: ${snippet}`);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "ייבוא הפוסט נכשל");
    } finally {
      setImporting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accountId) {
      setError("התחברו כמשתמש בדיקה לפני שליחה לתור.");
      return;
    }
    if (!name.trim()) {
      setError("יש למלא כותרת קמפיין.");
      return;
    }
    if (!composer.text.trim() && !composer.image && !composer.hasImage) {
      setError("יש להוסיף תוכן טקסט או תמונה.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("יש לבחור לפחות קבוצה אחת.");
      return;
    }
    if (composer.whatsappEnabled) {
      const waUrl = buildWhatsAppMeUrl(
        composer.whatsappPhone,
        composer.whatsappMessage
      );
      if (!waUrl) {
        setError("נא להזין מספר וואטסאפ תקין (למשל 05X-XXXXXXX).");
        return;
      }
    }

    setPending(true);
    try {
      const eventTime = composer.scheduleTime
        ? datetimeLocalToIso(composer.scheduleTime)
        : null;

      const mediaUrls: string[] = [];
      if (composer.image) {
        mediaUrls.push(await fileToDataUrl(composer.image));
      }
      // Keep stored image when editing unless the user explicitly removed it.
      const imageUrl = composer.image
        ? mediaUrls[0] || ""
        : composer.hasImage && existingImageUrl
          ? existingImageUrl
          : editingId && composer.hasImage === false
            ? ""
            : mediaUrls[0] || existingImageUrl || "";

      const rawContent = appendWhatsAppLink(
        composer.text.trim() || "(תמונה)",
        {
          enabled: composer.whatsappEnabled,
          phone: composer.whatsappPhone,
          message: composer.whatsappMessage,
        }
      );

      const scheduleIso = eventTime;
      const isRecurring = composer.scheduleType === "recurring";
      const isFutureOnce =
        Boolean(scheduleIso) &&
        new Date(scheduleIso as string).getTime() > Date.now() + 30_000;
      const isEditingSchedule = Boolean(editingId);

      if (isRecurring || isFutureOnce || isEditingSchedule) {
        if (isRecurring && composer.daysOfWeek.length === 0) {
          setError("נא לבחור לפחות יום אחד לקמפיין מחזורי.");
          setPending(false);
          return;
        }

        const targetGroups = activeChannels
          .filter((c) => selectedIds.has(c.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            externalId: c.externalId,
            url: c.externalId
              ? `https://www.facebook.com/groups/${c.externalId}`
              : undefined,
          }));

        const endDateIso =
          composer.endMode === "end_date" && composer.endDate
            ? new Date(`${composer.endDate}T23:59:59`).toISOString()
            : null;

        const payload = {
          name: name.trim(),
          content: rawContent,
          imageUrl,
          targetGroups,
          scheduledTime: isRecurring ? null : scheduleIso,
          delaySeconds: composer.intervalDelay,
          scheduleType: composer.scheduleType,
          daysOfWeek: isRecurring ? composer.daysOfWeek : [],
          runTime: composer.runTime || "07:00",
          endDate: composer.endMode === "end_date" ? endDateIso : null,
          maxRuns:
            composer.endMode === "max_runs" ? composer.maxRuns : null,
          whatsapp: composer.whatsappEnabled
            ? {
                phone: composer.whatsappPhone,
                message: composer.whatsappMessage,
                url: buildWhatsAppMeUrl(
                  composer.whatsappPhone,
                  composer.whatsappMessage
                ),
              }
            : null,
        };

        const res = editingId
          ? await fetch(`/api/scheduled-posts/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...payload,
                status: "pending",
                isActive: true,
              }),
            })
          : await fetch("/api/scheduled-posts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

        const data = (await res.json()) as {
          success: boolean;
          error?: string;
          post?: ScheduledPostDTO;
        };

        if (!res.ok || !data.success || !data.post) {
          throw new Error(data.error ?? "שמירת התזמון נכשלה");
        }

        notifyExtensionSchedule(data.post);
        const whenLabel = data.post.nextRunAt || data.post.scheduledTime;
        setSuccess(
          editingId
            ? `הקמפיין עודכן — הריצה הבאה ב־${whenLabel ? new Date(whenLabel).toLocaleString("he-IL") : "—"}`
            : isRecurring
              ? `קמפיין מחזורי נשמר — הריצה הבאה ב־${new Date(whenLabel!).toLocaleString("he-IL")}`
              : `הפוסט נשמר בלוח התזמונים ל־${new Date(whenLabel!).toLocaleString("he-IL")}`
        );
        setName("");
        setImportUrl("");
        setSelectedIds(new Set());
        setEditingId(null);
        setExistingImageUrl("");
        setSeed({ text: "", imageDataUrl: null, scheduleTime: "" });
        setSeedKey((k) => k + 1);
        return;
      }

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          rawContent,
          mediaUrls,
          channelIds: [...selectedIds],
          eventTime,
          schedule: true,
          intervalDelay: composer.intervalDelay,
          whatsapp: composer.whatsappEnabled
            ? {
                phone: composer.whatsappPhone,
                message: composer.whatsappMessage,
                url: buildWhatsAppMeUrl(
                  composer.whatsappPhone,
                  composer.whatsappMessage
                ),
              }
            : null,
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
      setImportUrl("");
      setSelectedIds(new Set());
      setSeed({ text: "", imageDataUrl: null });
      setSeedKey((k) => k + 1);
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

  const busy = pending || importing;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {editingId ? "עריכת קמפיין פעיל" : "עורך פוסט"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {editingId
              ? "עדכנו טקסט, תמונה, קבוצות או תזמון — השינויים יחולו על הריצות הבאות."
              : "כתבו פעם אחת או ייבאו פוסט קיים — פרסמו לקבוצות נבחרות."}
          </p>
        </div>
        <Badge variant={badgeVariant} className="text-sm">
          {priorityBadgeLabel(detection.priority)}
        </Badge>
      </div>

      <div
        role="tablist"
        aria-label="מצב עריכה"
        className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          onClick={() => setMode("create")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <PenLine className="size-3.5" />
          יצירת פוסט
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "import"}
          onClick={() => setMode("import")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "import"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Link2 className="size-3.5" />
          ייבוא מפוסט קיים
        </button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign-name">כותרת קמפיין</Label>
        <Input
          id="campaign-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: ערב משחק הערב"
          disabled={busy}
        />
      </div>

      {mode === "import" && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="space-y-2">
            <Label htmlFor="import-url">קישור לפוסט בפייסבוק</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="import-url"
                dir="ltr"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://www.facebook.com/..."
                disabled={busy}
                className="flex-1 text-left"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void handleImport()}
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                ייבא
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              עובד בעיקר על פוסטים ציבוריים. לפוסטים בפרופיל שלכם — השתמשו בכפתור
              &quot;הפץ עם DISTRO&quot; בתוסף.
            </p>
          </div>
          {importError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {importError}
            </p>
          )}
        </div>
      )}

      <FacebookComposer
        onDataChange={setComposer}
        disabled={busy}
        seed={seed}
        seedKey={seedKey}
        headerTitle={
          editingId
            ? "עריכת קמפיין"
            : mode === "import"
              ? "ייבוא מפוסט קיים"
              : "יצירת פוסט"
        }
      />

      {detection.reason && (
        <p className="text-xs text-muted-foreground">{detection.reason}</p>
      )}

      <TargetGroupsSelector
        groups={activeChannels.map((c) => ({
          id: c.id,
          name: c.name,
          memberCount: c.memberCount,
        }))}
        selectedGroupIds={[...selectedIds]}
        onSelectionChange={(ids) => setSelectedIds(new Set(ids))}
        disabled={busy}
      />

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

      <Button type="submit" disabled={busy || !accountId}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Send className="size-4" />
        )}
        {composer.scheduleType === "recurring" ||
        (composer.scheduleTime &&
          new Date(composer.scheduleTime).getTime() > Date.now())
          ? "שמור ושלח לפרסום (תזמון)"
          : "שגר לתור הפצה"}
      </Button>
    </form>
  );
}
