"use client";

import * as React from "react";
import {
  DEFAULT_WHATSAPP_MESSAGE,
  readSavedWhatsAppPhone,
  saveWhatsAppPhone,
} from "@/lib/whatsapp";
import {
  HE_WEEKDAY_LABELS,
  type ScheduleEndMode,
  type ScheduleType,
} from "@/lib/schedule-engine";

export type FacebookComposerData = {
  text: string;
  image: File | null;
  /** True when a preview is showing (seeded or newly picked). */
  hasImage: boolean;
  scheduleTime: string;
  intervalDelay: number;
  scheduleType: ScheduleType;
  daysOfWeek: number[];
  runTime: string;
  endMode: ScheduleEndMode;
  endDate: string;
  maxRuns: number;
  whatsappEnabled: boolean;
  whatsappPhone: string;
  whatsappMessage: string;
};

export type FacebookComposerSeed = {
  text?: string;
  imageFile?: File | null;
  imageDataUrl?: string | null;
  scheduleTime?: string;
  scheduleType?: ScheduleType;
  daysOfWeek?: number[];
  runTime?: string;
  intervalDelay?: number;
  endMode?: ScheduleEndMode;
  endDate?: string;
  maxRuns?: number;
  whatsappEnabled?: boolean;
  whatsappPhone?: string;
  whatsappMessage?: string;
  openTiming?: boolean;
  openWhatsApp?: boolean;
};

type ComposerProps = {
  onDataChange: (data: FacebookComposerData) => void;
  disabled?: boolean;
  /** Bump to re-apply seed into the composer */
  seedKey?: number;
  seed?: FacebookComposerSeed | null;
  headerTitle?: string;
};

async function dataUrlToFile(
  dataUrl: string,
  filename = "imported.jpg"
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || "image/jpeg";
  const ext = type.split("/")[1] || "jpg";
  const name = filename.includes(".") ? filename : `${filename}.${ext}`;
  return new File([blob], name, { type });
}

export function FacebookComposer({
  onDataChange,
  disabled,
  seedKey = 0,
  seed = null,
  headerTitle = "יצירת פוסט",
}: ComposerProps) {
  const [text, setText] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [showTiming, setShowTiming] = React.useState(false);
  const [showWhatsApp, setShowWhatsApp] = React.useState(false);
  const [scheduleTime, setScheduleTime] = React.useState("");
  const [intervalDelay, setIntervalDelay] = React.useState(60);
  const [scheduleType, setScheduleType] = React.useState<ScheduleType>("once");
  const [daysOfWeek, setDaysOfWeek] = React.useState<number[]>([6]); // Saturday default
  const [runTime, setRunTime] = React.useState("07:00");
  const [endMode, setEndMode] = React.useState<ScheduleEndMode>("never");
  const [endDate, setEndDate] = React.useState("");
  const [maxRuns, setMaxRuns] = React.useState(10);
  const [whatsappEnabled, setWhatsappEnabled] = React.useState(false);
  const [whatsappPhone, setWhatsappPhone] = React.useState("");
  const [whatsappMessage, setWhatsappMessage] = React.useState(
    DEFAULT_WHATSAPP_MESSAGE
  );
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const appliedSeedKey = React.useRef<number>(-1);
  const onDataChangeRef = React.useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  React.useEffect(() => {
    const saved = readSavedWhatsAppPhone();
    if (saved) setWhatsappPhone(saved);
  }, []);

  // Notify parent after commit — never during render / setState updaters.
  React.useEffect(() => {
    onDataChangeRef.current({
      text,
      image: imageFile,
      hasImage: Boolean(imagePreview),
      scheduleTime,
      intervalDelay,
      scheduleType,
      daysOfWeek,
      runTime,
      endMode,
      endDate,
      maxRuns,
      whatsappEnabled,
      whatsappPhone,
      whatsappMessage,
    });
  }, [
    text,
    imageFile,
    imagePreview,
    scheduleTime,
    intervalDelay,
    scheduleType,
    daysOfWeek,
    runTime,
    endMode,
    endDate,
    maxRuns,
    whatsappEnabled,
    whatsappPhone,
    whatsappMessage,
  ]);

  const clearPreviewUrl = React.useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const applyImageFile = React.useCallback(
    (file: File | null) => {
      clearPreviewUrl();
      if (!file) {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const url = URL.createObjectURL(file);
      previewUrlRef.current = url;
      setImageFile(file);
      setImagePreview(url);
    },
    [clearPreviewUrl]
  );

  React.useEffect(() => {
    return () => clearPreviewUrl();
  }, [clearPreviewUrl]);

  React.useEffect(() => {
    if (!seed || seedKey === appliedSeedKey.current) return;
    appliedSeedKey.current = seedKey;

    let cancelled = false;

    void (async () => {
      const nextText = seed.text ?? "";
      setText(nextText);
      if (seed.scheduleTime !== undefined) {
        setScheduleTime(seed.scheduleTime);
        if (seed.scheduleTime) setShowTiming(true);
      }
      if (seed.scheduleType) setScheduleType(seed.scheduleType);
      if (seed.daysOfWeek) setDaysOfWeek(seed.daysOfWeek);
      if (seed.runTime) setRunTime(seed.runTime);
      if (seed.intervalDelay != null) setIntervalDelay(seed.intervalDelay);
      if (seed.endMode) setEndMode(seed.endMode);
      if (seed.endDate !== undefined) setEndDate(seed.endDate);
      if (seed.maxRuns != null) setMaxRuns(seed.maxRuns);
      if (seed.whatsappEnabled != null) {
        setWhatsappEnabled(seed.whatsappEnabled);
        if (seed.whatsappEnabled) setShowWhatsApp(true);
      }
      if (seed.whatsappPhone !== undefined) setWhatsappPhone(seed.whatsappPhone);
      if (seed.whatsappMessage !== undefined) {
        setWhatsappMessage(seed.whatsappMessage);
      }
      if (seed.openTiming) setShowTiming(true);
      if (seed.openWhatsApp) {
        setShowWhatsApp(true);
        setWhatsappEnabled(true);
      }

      let nextImage: File | null = seed.imageFile ?? null;
      if (!nextImage && seed.imageDataUrl) {
        try {
          nextImage = await dataUrlToFile(seed.imageDataUrl, "imported");
        } catch {
          nextImage = null;
        }
      }
      if (cancelled) return;

      clearPreviewUrl();
      if (nextImage) {
        const url = URL.createObjectURL(nextImage);
        previewUrlRef.current = url;
        setImageFile(nextImage);
        setImagePreview(url);
      } else {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-run when seedKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyImageFile(file);
  };

  const removeImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    applyImageFile(null);
  };

  const openFilePicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const toggleTiming = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setShowTiming((v) => !v);
  };

  const toggleWhatsApp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const next = !showWhatsApp;
    setShowWhatsApp(next);
    if (next) setWhatsappEnabled(true);
  };

  return (
    <div
      dir="rtl"
      className="mx-auto w-full max-w-xl rounded-xl border border-[#e4e6eb] bg-white p-4 text-right text-[#050505] shadow-sm"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={handleImageSelect}
        disabled={disabled}
        aria-hidden
      />

      <div className="border-b border-[#e4e6eb] pb-3 text-center">
        <h3 className="text-base font-semibold text-[#050505]">{headerTitle}</h3>
      </div>

      <div className="my-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e4e6eb]">
          <svg
            className="h-6 w-6 text-[#65676b]"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        <div>
          <span className="block text-sm font-semibold text-[#050505]">
            פרסום קבוצתי
          </span>
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-[#e4e6eb] px-2 py-0.5 text-xs text-[#65676b]">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            פרסום אוטומטי
          </span>
        </div>
      </div>

      <div className="my-2 min-h-[110px]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="על מה אתה חושב? ספר לחברי הקבוצות..."
          rows={4}
          disabled={disabled}
          className="w-full resize-none border-0 bg-transparent text-[15px] text-[#050505] outline-none placeholder:text-[#65676b] disabled:opacity-50"
        />

        {imagePreview && (
          <div className="relative mt-2 max-h-56 overflow-hidden rounded-lg border border-[#ced0d4] bg-[#f0f2f5]">
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
              <button
                type="button"
                onClick={openFilePicker}
                disabled={disabled}
                className="rounded-full border border-[#ced0d4] bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[#050505] shadow-sm hover:bg-white disabled:opacity-50"
                title="החלף תמונה"
              >
                החלף תמונה
              </button>
              <button
                type="button"
                onClick={removeImage}
                disabled={disabled}
                className="rounded-full border border-[#ced0d4] bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-red-600 shadow-sm hover:bg-white disabled:opacity-50"
                title="הסר תמונה"
              >
                הסר
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="תצוגה מקדימה"
              className="max-h-56 w-full object-contain"
            />
          </div>
        )}
      </div>

      <div className="my-3 flex items-center justify-between rounded-lg border border-[#ced0d4] bg-[#f0f2f5] p-2.5">
        <span className="text-xs font-semibold text-[#050505]">
          הוסף לפוסט שלך
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled}
            className="rounded-full p-1.5 transition-colors hover:bg-[#e4e6eb] disabled:opacity-50"
            title="הוסף תמונה"
            aria-label="הוסף תמונה"
          >
            <svg
              className="h-6 w-6 text-[#45bd62]"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleTiming}
            disabled={disabled}
            aria-pressed={showTiming}
            aria-expanded={showTiming}
            className={`rounded-full p-1.5 transition-colors disabled:opacity-50 ${
              showTiming ? "bg-[#e4e6eb]" : "hover:bg-[#e4e6eb]"
            }`}
            title="תזמון וזמני השהייה"
            aria-label="תזמון וזמני השהייה"
          >
            <svg
              className="h-6 w-6 text-[#1877f2]"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleWhatsApp}
            disabled={disabled}
            aria-pressed={showWhatsApp}
            aria-expanded={showWhatsApp}
            className={`rounded-full p-1.5 transition-colors disabled:opacity-50 ${
              showWhatsApp ? "bg-[#e4e6eb]" : "hover:bg-[#e4e6eb]"
            }`}
            title="קישור לוואטסאפ"
            aria-label="קישור לוואטסאפ"
          >
            <svg
              className="h-6 w-6 text-[#25D366]"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </button>
        </div>
      </div>

      {showTiming && (
        <div className="my-3 space-y-3 rounded-lg border border-[#ced0d4] bg-[#f0f2f5] p-3">
          <p className="text-xs font-semibold text-[#050505]">תזמון מתקדם</p>

          <div className="inline-flex rounded-lg border border-[#ced0d4] bg-white p-0.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setScheduleType("once")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                scheduleType === "once"
                  ? "bg-[#1877f2] text-white"
                  : "text-[#65676b] hover:bg-[#f0f2f5]"
              }`}
            >
              פרסום חד-פעמי
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setScheduleType("recurring")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                scheduleType === "recurring"
                  ? "bg-[#1877f2] text-white"
                  : "text-[#65676b] hover:bg-[#f0f2f5]"
              }`}
            >
              פרסום מחזורי (קמפיין קבוע)
            </button>
          </div>

          {scheduleType === "once" ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="fb-schedule-time"
                className="text-xs text-[#65676b]"
              >
                מועד פרסום (השאר ריק לפרסום מיידי):
              </label>
              <input
                id="fb-schedule-time"
                type="datetime-local"
                value={scheduleTime}
                disabled={disabled}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="rounded-md border border-[#ced0d4] bg-white p-2 text-xs text-[#050505] outline-none focus:border-[#1877f2] disabled:opacity-50"
                dir="ltr"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[#65676b]">ימי השבוע</span>
                <div className="flex flex-wrap gap-1.5">
                  {HE_WEEKDAY_LABELS.map((label, day) => {
                    const selected = daysOfWeek.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setDaysOfWeek((prev) =>
                            selected
                              ? prev.filter((d) => d !== day)
                              : [...prev, day].sort()
                          );
                        }}
                        className={`min-w-8 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                          selected
                            ? "bg-[#1877f2] text-white"
                            : "bg-white text-[#65676b] ring-1 ring-[#ced0d4] hover:bg-[#e7f3ff]"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="fb-run-time" className="text-xs text-[#65676b]">
                  שעת פרסום
                </label>
                <input
                  id="fb-run-time"
                  type="time"
                  value={runTime}
                  disabled={disabled}
                  onChange={(e) => setRunTime(e.target.value || "07:00")}
                  className="max-w-[9rem] rounded-md border border-[#ced0d4] bg-white p-2 text-xs text-[#050505] outline-none focus:border-[#1877f2] disabled:opacity-50"
                  dir="ltr"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[#65676b]">תנאי סיום</span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["never", "ללא הגבלה"],
                      ["end_date", "תאריך סיום"],
                      ["max_runs", "הפסק לאחר X פרסומים"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      disabled={disabled}
                      onClick={() => setEndMode(mode)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        endMode === mode
                          ? "bg-[#050505] text-white"
                          : "bg-white text-[#65676b] ring-1 ring-[#ced0d4]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {endMode === "end_date" && (
                  <input
                    type="date"
                    value={endDate}
                    disabled={disabled}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 max-w-[12rem] rounded-md border border-[#ced0d4] bg-white p-2 text-xs outline-none focus:border-[#1877f2]"
                    dir="ltr"
                  />
                )}
                {endMode === "max_runs" && (
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={maxRuns}
                    disabled={disabled}
                    onChange={(e) =>
                      setMaxRuns(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="mt-1 max-w-[8rem] rounded-md border border-[#ced0d4] bg-white p-2 text-xs outline-none focus:border-[#1877f2]"
                    dir="ltr"
                  />
                )}
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="fb-interval-delay"
              className="text-xs text-[#65676b]"
            >
              השהייה בין קבוצות:
            </label>
            <select
              id="fb-interval-delay"
              value={intervalDelay}
              disabled={disabled}
              onChange={(e) => setIntervalDelay(Number(e.target.value))}
              className="rounded-md border border-[#ced0d4] bg-white p-2 text-xs text-[#050505] outline-none focus:border-[#1877f2] disabled:opacity-50"
            >
              <option value={30}>30 שניות</option>
              <option value={60}>דקה (מומלץ)</option>
              <option value={120}>2 דקות</option>
              <option value={300}>5 דקות</option>
            </select>
          </div>
        </div>
      )}

      {showWhatsApp && (
        <div className="my-3 space-y-3 rounded-lg border border-[#ced0d4] bg-[#f0f2f5] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#050505]">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              disabled={disabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
              className="size-4 accent-[#25D366]"
            />
            צרף קישור ישיר לוואטסאפ שלי
          </label>

          <div className="flex flex-col gap-1">
            <label htmlFor="fb-wa-phone" className="text-xs text-[#65676b]">
              מספר טלפון (ישראל)
            </label>
            <input
              id="fb-wa-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              placeholder="05X-XXXXXXX"
              value={whatsappPhone}
              disabled={disabled || !whatsappEnabled}
              onChange={(e) => {
                const val = e.target.value;
                setWhatsappPhone(val);
                saveWhatsAppPhone(val);
              }}
              className="rounded-md border border-[#ced0d4] bg-white p-2 text-left text-xs text-[#050505] outline-none focus:border-[#25D366] disabled:opacity-50"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fb-wa-message" className="text-xs text-[#65676b]">
              הודעת פתיחה
            </label>
            <input
              id="fb-wa-message"
              type="text"
              value={whatsappMessage}
              disabled={disabled || !whatsappEnabled}
              onChange={(e) => setWhatsappMessage(e.target.value)}
              className="rounded-md border border-[#ced0d4] bg-white p-2 text-xs text-[#050505] outline-none focus:border-[#25D366] disabled:opacity-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default FacebookComposer;
