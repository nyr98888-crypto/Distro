"use client";

import * as React from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { ChannelDTO } from "@/lib/channels-shared";
import type { GroupPresetDTO } from "@/lib/group-presets";
import {
  HE_WEEKDAY_LABELS,
  type ScheduleEndMode,
  type ScheduleType,
} from "@/lib/schedule-engine";
import type { ScheduledPostDTO } from "@/lib/scheduled-posts";
import { notifyExtensionSchedule } from "@/lib/extension-bridge";
import {
  appendWhatsAppLink,
  buildWhatsAppMeUrl,
  DEFAULT_WHATSAPP_MESSAGE,
  readSavedWhatsAppPhone,
  saveWhatsAppPhone,
  stripWhatsAppFooter,
} from "@/lib/whatsapp";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-slate-500">{children}</p>;
}

type Step = 1 | 2 | 3;

type WizardProps = {
  channels: ChannelDTO[];
  accountId: string | null;
  editPostId?: string | null;
  initialScheduleTime?: string | null;
  /** When opening from the calendar, jump straight to timing. */
  initialStep?: Step;
  onSaved?: (post: ScheduledPostDTO) => void;
  onCancelEdit?: () => void;
};

const DELAY_OPTIONS = [
  { value: 30, label: "30 שניות" },
  { value: 60, label: "60 שניות (מומלץ)" },
  { value: 120, label: "120 שניות" },
  { value: 300, label: "300 שניות" },
];

async function uploadCampaignImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as {
    success?: boolean;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.success || !data.url) {
    throw new Error(data.error || "Image upload failed");
  }
  return data.url;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AutoResizeTextarea({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(140, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={5}
      className="w-full resize-none rounded-xl border border-transparent bg-[#f0f2f5] px-4 py-3 text-[15px] text-[#050505] outline-none transition focus:border-[#1877f2] focus:bg-white disabled:opacity-50"
    />
  );
}

export function CampaignWizard({
  channels,
  accountId,
  editPostId = null,
  initialScheduleTime = null,
  initialStep = 1,
  onSaved,
  onCancelEdit,
}: WizardProps) {
  const [step, setStep] = React.useState<Step>(() => {
    if (editPostId) return 1;
    if (initialStep === 2 || initialStep === 3) return initialStep;
    return initialScheduleTime ? 3 : 1;
  });
  const [editingId, setEditingId] = React.useState<string | null>(editPostId);
  const [name, setName] = React.useState("");
  const [content, setContent] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = React.useState("");
  const [whatsappEnabled, setWhatsappEnabled] = React.useState(false);
  const [whatsappPhone, setWhatsappPhone] = React.useState("");
  const [whatsappMessage, setWhatsappMessage] = React.useState(
    DEFAULT_WHATSAPP_MESSAGE
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [presets, setPresets] = React.useState<GroupPresetDTO[]>([]);
  const [presetId, setPresetId] = React.useState("");
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [scheduleType, setScheduleType] = React.useState<ScheduleType>(() =>
    initialScheduleTime ? "once" : "immediate"
  );
  const [scheduleTime, setScheduleTime] = React.useState(
    initialScheduleTime || ""
  );
  const [daysOfWeek, setDaysOfWeek] = React.useState<number[]>([6]);
  const [runTime, setRunTime] = React.useState("07:00");
  const [endMode, setEndMode] = React.useState<ScheduleEndMode>("never");
  const [endDate, setEndDate] = React.useState("");
  const [maxRuns, setMaxRuns] = React.useState(10);
  const [delaySeconds, setDelaySeconds] = React.useState(60);
  const [executionMode, setExecutionMode] = React.useState<
    "extension" | "cloud"
  >("extension");
  const [pending, setPending] = React.useState(false);
  const [loadingEdit, setLoadingEdit] = React.useState(Boolean(editPostId));
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const previewRef = React.useRef<string | null>(null);
  const { t, dir } = useI18n();

  const activeChannels = React.useMemo(
    () => (Array.isArray(channels) ? channels : []).filter((c) => c?.isActive),
    [channels]
  );

  const filteredGroups = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeChannels;
    return activeChannels.filter((g) =>
      (g?.name || "").toLowerCase().includes(q)
    );
  }, [activeChannels, searchQuery]);

  React.useEffect(() => {
    const saved = readSavedWhatsAppPhone();
    if (saved) setWhatsappPhone(saved);
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/group-presets");
        const data = (await res.json()) as {
          success: boolean;
          presets?: GroupPresetDTO[];
        };
        if (res.ok && data.success) {
          setPresets(Array.isArray(data.presets) ? data.presets : []);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!editPostId) return;
    let cancelled = false;
    setLoadingEdit(true);
    void (async () => {
      try {
        const res = await fetch(`/api/scheduled-posts/${editPostId}`);
        const data = (await res.json()) as {
          success: boolean;
          post?: ScheduledPostDTO;
        };
        if (!res.ok || !data.success || !data.post || cancelled) return;
        const post = data.post;
        setEditingId(post.id);
        setName(post.name || "");
        setContent(stripWhatsAppFooter(post.content || ""));
        setExistingImageUrl(post.imageUrl || "");
        if (post.imageUrl) setImagePreview(post.imageUrl);
        const groups = Array.isArray(post.targetGroups) ? post.targetGroups : [];
        setSelectedIds(groups.map((g) => g?.id).filter(Boolean) as string[]);
        setScheduleType(
          post.scheduleType === "recurring"
            ? "recurring"
            : post.scheduleType === "immediate"
              ? "immediate"
              : "once"
        );
        setScheduleTime(
          toDatetimeLocal(post.nextRunAt || post.scheduledTime || "")
        );
        const days = Array.isArray(post.daysOfWeek) ? post.daysOfWeek : [];
        setDaysOfWeek(days.length ? days : [6]);
        setRunTime(post.runTime || "07:00");
        setDelaySeconds(post.delaySeconds || 60);
        setExecutionMode(
          post.executionMode === "cloud" ? "cloud" : "extension"
        );
        if (post.maxRuns != null) {
          setEndMode("max_runs");
          setMaxRuns(post.maxRuns);
        } else if (post.endDate) {
          setEndMode("end_date");
          setEndDate(String(post.endDate).slice(0, 10));
        } else {
          setEndMode("never");
        }
        setStep(1);
      } catch {
        if (!cancelled) setError("טעינת הקמפיין לעריכה נכשלה");
      } finally {
        if (!cancelled) setLoadingEdit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editPostId]);

  React.useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function applyImage(file: File | null) {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      setExistingImageUrl("");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setImageFile(file);
    setImagePreview(url);
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function toggleGroup(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }

  const allFilteredSelected =
    filteredGroups.length > 0 &&
    filteredGroups.every((g) => selectedIds.includes(g.id));

  function toggleSelectFiltered() {
    if (allFilteredSelected) {
      const filtered = new Set(filteredGroups.map((g) => g.id));
      setSelectedIds((prev) => prev.filter((id) => !filtered.has(id)));
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...filteredGroups.map((g) => g.id)]))
      );
    }
  }

  function applyPreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    const valid = new Set(activeChannels.map((c) => c.id));
    const ids = Array.isArray(preset.groupIds) ? preset.groupIds : [];
    setSelectedIds(ids.filter((gid) => valid.has(gid)));
  }

  async function savePreset() {
    if (selectedIds.length === 0) {
      setError("נא לבחור קבוצות לפני שמירת תבנית");
      return;
    }
    const label = window.prompt("שם לתבנית הקבוצות:", "תבנית קבוצות חדשה");
    if (!label?.trim()) return;
    setSavingPreset(true);
    setError(null);
    try {
      const res = await fetch("/api/group-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: label.trim(),
          groupIds: selectedIds,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        preset?: GroupPresetDTO;
        error?: string;
      };
      if (!res.ok || !data.success || !data.preset) {
        throw new Error(data.error || "שמירת התבנית נכשלה");
      }
      setPresets((prev) => [data.preset!, ...prev]);
      setPresetId(data.preset.id);
      setSuccess(`התבנית "${data.preset.name}" נשמרה`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירת התבנית נכשלה");
    } finally {
      setSavingPreset(false);
    }
  }

  function validateStep(s: Step): string | null {
    if (s === 1) {
      if (!name.trim()) return "נא למלא שם פנימי לקמפיין";
      if (!content.trim() && !imagePreview) {
        return "נא להוסיף תוכן טקסט או תמונה";
      }
      if (whatsappEnabled) {
        const url = buildWhatsAppMeUrl(whatsappPhone, whatsappMessage);
        if (!url) return "נא להזין מספר וואטסאפ תקין (05X-XXXXXXX)";
      }
    }
    if (s === 2 && selectedIds.length === 0) {
      return "נא לבחור לפחות קבוצה אחת";
    }
    if (s === 3) {
      if (scheduleType === "once" && !scheduleTime) {
        return "נא לבחור תאריך ושעה לפרסום חד-פעמי";
      }
      if (scheduleType === "recurring" && daysOfWeek.length === 0) {
        return "נא לבחור לפחות יום אחד למחזור";
      }
      if (scheduleType === "recurring" && endMode === "end_date" && !endDate) {
        return "נא לבחור תאריך סיום";
      }
    }
    return null;
  }

  function goNext() {
    setError(null);
    const err = validateStep(step);
    if (err) {
      setError(err);
      window.requestAnimationFrame(() => {
        document
          .getElementById("distro-wizard-error")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }
    setStep((s) => Math.min(3, s + 1) as Step);
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1) as Step);
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    for (const s of [1, 2, 3] as Step[]) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        setError(err);
        return;
      }
    }
    if (!accountId) {
      setError("יש להתחבר לפני הפעלת קמפיין");
      return;
    }

    setPending(true);
    try {
      if (whatsappEnabled && whatsappPhone) {
        saveWhatsAppPhone(whatsappPhone);
      }

      let imageUrl = existingImageUrl;
      if (imageFile) imageUrl = await uploadCampaignImage(imageFile);
      if (!imagePreview) imageUrl = "";

      const rawContent = appendWhatsAppLink(content.trim() || "(תמונה)", {
        enabled: whatsappEnabled,
        phone: whatsappPhone,
        message: whatsappMessage,
      });

      const targetGroups = activeChannels
        .filter((c) => selectedIds.includes(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          externalId: c.externalId,
          url:
            c.url ||
            (c.externalId
              ? `https://www.facebook.com/groups/${c.externalId}`
              : undefined),
        }));

      const endDateIso =
        endMode === "end_date" && endDate
          ? new Date(`${endDate}T23:59:59`).toISOString()
          : null;

      const payload = {
        name: name.trim(),
        content: rawContent,
        imageUrl,
        image_url: imageUrl,
        targetGroups,
        target_group_ids: selectedIds,
        scheduledTime:
          scheduleType === "once" ? datetimeLocalToIso(scheduleTime) : null,
        delaySeconds,
        scheduleType:
          scheduleType === "immediate" ? ("now" as const) : scheduleType,
        schedule_type:
          scheduleType === "immediate" ? ("now" as const) : scheduleType,
        daysOfWeek: scheduleType === "recurring" ? daysOfWeek : [],
        target_days: scheduleType === "recurring" ? daysOfWeek : [],
        runTime: runTime || "07:00",
        run_time: runTime || "07:00",
        endDate: endMode === "end_date" ? endDateIso : null,
        maxRuns: endMode === "max_runs" ? maxRuns : null,
        executionMode,
        whatsappPhone: whatsappEnabled ? whatsappPhone : "",
        whatsapp_phone: whatsappEnabled ? whatsappPhone : "",
        whatsappMessage: whatsappEnabled ? whatsappMessage : "",
        whatsapp_message: whatsappEnabled ? whatsappMessage : "",
        whatsapp: whatsappEnabled
          ? {
              phone: whatsappPhone,
              message: whatsappMessage,
              url: buildWhatsAppMeUrl(whatsappPhone, whatsappMessage),
            }
          : null,
      };

      const res = editingId
        ? await fetch(`/api/scheduled-posts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: payload.name,
              content: payload.content,
              imageUrl,
              targetGroups,
              scheduledTime: payload.scheduledTime,
              delaySeconds,
              scheduleType,
              daysOfWeek: payload.daysOfWeek,
              runTime: payload.runTime,
              endDate: payload.endDate,
              maxRuns: payload.maxRuns,
              executionMode,
              whatsapp: payload.whatsapp,
              status: "pending",
              isActive: true,
            }),
          })
        : await fetch("/api/campaigns/create", {
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
        throw new Error(data.error || "שמירת הקמפיין נכשלה");
      }

      notifyExtensionSchedule(data.post);
      const when = data.post.nextRunAt || data.post.scheduledTime;
      setSuccess(
        scheduleType === "immediate"
          ? "הקמפיין הופעל — הפרסום מתחיל מיד דרך התוסף"
          : editingId
            ? `הקמפיין עודכן · הריצה הבאה ${when ? new Date(when).toLocaleString("he-IL") : ""}`
            : `הקמפיין נשמר והופעל · הריצה הבאה ${when ? new Date(when).toLocaleString("he-IL") : ""}`
      );
      onSaved?.(data.post);

      if (!editingId) {
        setName("");
        setContent("");
        applyImage(null);
        setExistingImageUrl("");
        setSelectedIds([]);
        setScheduleType("immediate");
        setScheduleTime("");
        setStep(1);
        setEditingId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setPending(false);
    }
  }

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        טוען קמפיין לעריכה…
      </div>
    );
  }

  const submitLabel =
    scheduleType === "immediate" ? t("publishNow") : t("savePublish");

  return (
    <div dir={dir} className="space-y-5 text-start">
      {editingId && (
        <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          <span>
            {dir === "rtl"
              ? "מצב עריכה — השינויים יחולו על כל הריצות הבאות"
              : "Edit mode — changes apply to upcoming runs"}
          </span>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs font-semibold underline"
            >
              {dir === "rtl" ? "ביטול עריכה" : "Cancel edit"}
            </button>
          )}
        </div>
      )}

      <ol className="grid grid-cols-3 gap-2">
        {[
          { n: 1 as Step, label: t("stepContent") },
          { n: 2 as Step, label: t("stepGroups") },
          { n: 3 as Step, label: t("stepTiming") },
        ].map((item) => {
          const active = step === item.n;
          const done = step > item.n;
          return (
            <li key={item.n}>
              <button
                type="button"
                onClick={() => {
                  if (item.n < step) setStep(item.n);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition",
                  active
                    ? "border-[#3B82F6] bg-[#EFF6FF] text-[#2563EB]"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-[#10B981]"
                      : "border-slate-200 bg-white text-slate-500"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    active
                      ? "bg-[#2563EB] text-white"
                      : done
                        ? "bg-[#10B981] text-white"
                        : "bg-slate-100 text-slate-500"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : item.n}
                </span>
                <span className="text-xs font-semibold sm:text-sm">
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <div
          id="distro-wizard-error"
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="rounded-2xl border border-[#e4e6eb] bg-white p-5 shadow-sm sm:p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {t("stepContent")}
              </h3>
              <FieldHint>
                {dir === "rtl"
                  ? "הגדירו את תוכן הפוסט, התמונה וקישור הוואטסאפ"
                  : "Set the post text, image, and optional WhatsApp link"}
              </FieldHint>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-900">
                {dir === "rtl" ? "שם פנימי לקמפיין" : "Campaign name"}
              </span>
              <FieldHint>{t("helperCampaignName")}</FieldHint>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  dir === "rtl"
                    ? "למשל: דירת 4 חדרים סוקולוב"
                    : "e.g. 4-bedroom Sokolov listing"
                }
                disabled={pending}
                className="w-full rounded-xl border border-transparent bg-slate-100 px-4 py-2.5 text-sm outline-none focus:border-[#3B82F6] focus:bg-white"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-900">
                {dir === "rtl" ? "עורך תוכן הפוסט" : "Post content"}
              </span>
              <FieldHint>{t("helperPostContent")}</FieldHint>
              <AutoResizeTextarea
                value={content}
                onChange={setContent}
                disabled={pending}
                placeholder={
                  dir === "rtl"
                    ? "על מה אתה רוצה לספר לחברי הקבוצות?"
                    : "What do you want to share with group members?"
                }
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-900">
                {dir === "rtl" ? "העלאת תמונה" : "Upload image"}
              </span>
              <FieldHint>{t("helperImage")}</FieldHint>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) applyImage(file);
                }}
              />
              {imagePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-[#ced0d4] bg-[#f0f2f5]">
                  <div className="absolute top-2 left-2 z-10 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm"
                    >
                      החלף תמונה
                    </button>
                    <button
                      type="button"
                      onClick={() => applyImage(null)}
                      className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-red-600 shadow-sm"
                    >
                      הסר תמונה
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt=""
                    className="max-h-64 w-full object-contain"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#ced0d4] bg-[#f0f2f5] px-4 py-10 text-sm text-[#65676b] transition hover:bg-[#e4e6eb]"
                >
                  <ImagePlus className="h-7 w-7 text-[#45bd62]" />
                  לחצו להעלאת תמונה
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <FieldHint>{t("helperWhatsapp")}</FieldHint>
              <button
                type="button"
                onClick={() => setWhatsappEnabled((v) => !v)}
                className={cn(
                  "mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  whatsappEnabled
                    ? "bg-[#25D366] text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                )}
              >
                WhatsApp
              </button>
              {whatsappEnabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-semibold text-[#050505]">
                      מספר טלפון
                    </span>
                    <input
                      dir="ltr"
                      value={whatsappPhone}
                      onChange={(e) => setWhatsappPhone(e.target.value)}
                      placeholder="05X-XXXXXXX"
                      className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-left text-sm outline-none ring-1 ring-[#ced0d4] focus:ring-[#25D366]"
                    />
                  </label>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[11px] font-semibold text-[#050505]">
                      הודעת פתיחה מותאמת
                    </span>
                    <input
                      value={whatsappMessage}
                      onChange={(e) => setWhatsappMessage(e.target.value)}
                      className="w-full rounded-lg border border-transparent bg-white px-3 py-2 text-sm outline-none ring-1 ring-[#ced0d4] focus:ring-[#25D366]"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {t("stepGroups")}
              </h3>
              <FieldHint>{t("helperGroupPick")}</FieldHint>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1 space-y-1.5">
                <span className="text-xs font-semibold text-slate-900">
                  {dir === "rtl" ? "תבניות קבוצות" : "Group templates"}
                </span>
                <FieldHint>{t("helperPresets")}</FieldHint>
                <select
                  value={presetId}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="w-full rounded-xl border border-transparent bg-[#f0f2f5] px-3 py-2.5 text-sm outline-none focus:border-[#1877f2] focus:bg-white"
                >
                  <option value="">בחרו תבנית…</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({(Array.isArray(p.groupIds) ? p.groupIds : []).length})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={savingPreset || selectedIds.length === 0}
                onClick={() => void savePreset()}
                className="rounded-xl bg-[#f0f2f5] px-4 py-2.5 text-xs font-semibold text-[#050505] hover:bg-[#e4e6eb] disabled:opacity-50"
              >
                {savingPreset ? "שומר…" : "שמור קבוצות נבחרות כתבנית חדשה"}
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-[#e7f3ff] px-2.5 py-1 text-xs font-semibold text-[#1877f2]">
                {selectedIds.length}/{activeChannels.length} קבוצות נבחרו
              </span>
              <button
                type="button"
                onClick={toggleSelectFiltered}
                disabled={filteredGroups.length === 0}
                className="text-xs font-semibold text-[#1877f2] hover:underline disabled:opacity-50"
              >
                {allFilteredSelected
                  ? "בטל בחירה"
                  : "בחר הכל מהתוצאות"}
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 right-3 h-4 w-4 text-[#65676b]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש קבוצה לפי שם..."
                className="w-full rounded-xl border border-transparent bg-[#f0f2f5] py-2.5 pr-10 pl-9 text-sm outline-none focus:border-[#1877f2] focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute top-2.5 left-3 text-[#65676b]"
                  aria-label="נקה"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="scrollbar-none max-h-72 space-y-1 overflow-y-auto">
              {filteredGroups.length === 0 ? (
                <p className="py-8 text-center text-xs text-[#65676b]">
                  לא נמצאו קבוצות — סנכרנו קבוצות מהתוסף ואז נסו שוב
                </p>
              ) : (
                filteredGroups.map((g) => {
                  const checked = selectedIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      aria-pressed={checked}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-right transition",
                        checked ? "bg-[#e7f3ff]" : "hover:bg-[#f0f2f5]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-[#1877f2] bg-[#1877f2] text-white"
                            : "border-[#ced0d4] bg-white"
                        )}
                        aria-hidden
                      >
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="flex-1 text-sm text-[#050505]">
                        {g.name}
                      </span>
                      {typeof g.memberCount === "number" && (
                        <span className="text-[11px] text-[#65676b]">
                          {g.memberCount.toLocaleString("he-IL")}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {t("stepTiming")}
              </h3>
              <FieldHint>{t("helperScheduleType")}</FieldHint>
            </div>

            <div className="grid gap-2">
              {(
                [
                  {
                    id: "immediate" as const,
                    title: "פרסום מיידי",
                    desc: "מתחיל לרוץ מיד דרך התוסף",
                  },
                  {
                    id: "once" as const,
                    title: "פרסום חד-פעמי",
                    desc: "תאריך ושעה מדויקים",
                  },
                  {
                    id: "recurring" as const,
                    title: "פרסום מחזורי (קמפיין קבוע)",
                    desc: "ימים ושעה קבועים כל שבוע",
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setScheduleType(opt.id)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-right transition",
                    scheduleType === opt.id
                      ? "border-[#3B82F6] bg-[#EFF6FF]"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <div className="text-sm font-semibold text-slate-900">
                    {opt.title}
                  </div>
                  <div className="text-xs text-slate-500">{opt.desc}</div>
                </button>
              ))}
            </div>

            {scheduleType === "once" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold">תאריך ושעה</span>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-xl bg-[#f0f2f5] px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#1877f2]"
                />
              </label>
            )}

            {scheduleType === "recurring" && (
              <div className="space-y-4 rounded-xl border border-[#e4e6eb] bg-[#f7f8fa] p-4">
                <div>
                  <p className="mb-2 text-xs font-semibold">ימי פרסום</p>
                  <div className="flex flex-wrap gap-1.5">
                    {HE_WEEKDAY_LABELS.map((label, day) => {
                      const on = daysOfWeek.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={cn(
                            "h-9 min-w-9 rounded-full px-2.5 text-xs font-semibold transition",
                            on
                              ? "bg-[#1877f2] text-white"
                              : "bg-white text-[#65676b] ring-1 ring-[#ced0d4]"
                          )}
                        >
                          {label}׳
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold">שעת פרסום</span>
                  <input
                    type="time"
                    value={runTime}
                    onChange={(e) => setRunTime(e.target.value)}
                    className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-[#ced0d4] outline-none"
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-semibold">תנאי סיום</p>
                  {(
                    [
                      { id: "never" as const, label: "ללא הגבלה" },
                      { id: "end_date" as const, label: "בתאריך מסוים" },
                      { id: "max_runs" as const, label: "לאחר X פרסומים" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="endMode"
                        checked={endMode === opt.id}
                        onChange={() => setEndMode(opt.id)}
                      />
                      {opt.label}
                    </label>
                  ))}
                  {endMode === "end_date" && (
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-[#ced0d4]"
                    />
                  )}
                  {endMode === "max_runs" && (
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={maxRuns}
                      onChange={(e) => setMaxRuns(Number(e.target.value) || 1)}
                      className="mt-1 w-28 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-[#ced0d4]"
                    />
                  )}
                </div>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-900">
                {dir === "rtl"
                  ? "מרווח בטיחות בין קבוצות"
                  : "Safety delay between groups"}
              </span>
              <FieldHint>{t("helperDelay")}</FieldHint>
              <select
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
                className="w-full rounded-xl bg-slate-100 px-3 py-2.5 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#3B82F6]"
              >
                {DELAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-900">
                {dir === "rtl" ? "מצב ביצוע" : "Run mode"}
              </p>
              <FieldHint>{t("helperExecution")}</FieldHint>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "extension"}
                  onChange={() => setExecutionMode("extension")}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">תוסף Chrome (מומלץ)</span>
                  <span className="mt-0.5 block text-xs text-[#65676b]">
                    מריץ על המחשב שלכם. אם המחשב כבוי — הענן ינסה להשלים.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="executionMode"
                  checked={executionMode === "cloud"}
                  onChange={() => setExecutionMode("cloud")}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">ענן בלבד</span>
                  <span className="mt-0.5 block text-xs text-[#65676b]">
                    מתאים לאייפון / ללא תוסף — דורש worker מוגדר
                    (DISTRO_CLOUD_WORKER_URL).
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1 || pending}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          {dir === "rtl" ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {t("back")}
        </button>

        {step < 3 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1D4ED8]"
          >
            {t("next")}
            {dir === "rtl" ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        )}
      </div>
    </div>
  );
}
