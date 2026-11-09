"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  notifyExtensionAddFacebookAccount,
  notifyExtensionSwitchFacebookAccountById,
} from "@/lib/extension-bridge";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type FacebookAccountListItem = {
  id: string;
  facebookId: string;
  name: string;
  avatarUrl: string;
  isActive: boolean;
  groupCount?: number;
};

type FacebookAccountBarProps = {
  className?: string;
  /** Sidebar sits at the bottom — open upward. Settings sits mid-page — open downward. */
  menuPlacement?: "up" | "down";
  /** Visual style: dark for the sidebar, light for /settings. */
  variant?: "dark" | "light";
};

export function FacebookAccountBar({
  className,
  menuPlacement = "up",
  variant = "light",
}: FacebookAccountBarProps) {
  const { t, dir } = useI18n();
  const [accounts, setAccounts] = React.useState<FacebookAccountListItem[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const active = accounts.find((a) => a.isActive) || accounts[0] || null;
  const isLight = variant === "light";

  const loadAccounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/facebook/accounts");
      const data = (await res.json()) as {
        success: boolean;
        accounts?: FacebookAccountListItem[];
      };
      if (res.ok && data.success) {
        setAccounts(data.accounts || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAccounts();
    const onFocus = () => void loadAccounts();
    const onSwitched = () => void loadAccounts();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (
        data?.source === "distro-extension" &&
        data.type === "ACCOUNT_SWITCHED"
      ) {
        void loadAccounts();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("distro-account-switched", onSwitched);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("distro-account-switched", onSwitched);
      window.removeEventListener("message", onMessage);
    };
  }, [loadAccounts]);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function switchTo(accountId: string) {
    if (busy || accountId === active?.id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await new Promise<void>((resolve) => {
        notifyExtensionSwitchFacebookAccountById(accountId, (ok, err) => {
          if (!ok) setMessage(err || "החלפת חשבון נכשלה — בדקו את התוסף");
          else {
            setMessage("החשבון הוחלף");
            window.dispatchEvent(new Event("distro-account-switched"));
            // Soft reload dashboard data for scoped groups/campaigns
            window.setTimeout(() => window.location.reload(), 600);
          }
          resolve();
        });
      });
      await loadAccounts();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function addAccount() {
    setBusy(true);
    setMessage(null);
    setOpen(false);
    try {
      await new Promise<void>((resolve) => {
        notifyExtensionAddFacebookAccount((ok, err) => {
          if (!ok) {
            setMessage(err || "פתיחת התחברות נכשלה");
            window.open("https://www.facebook.com/login/", "_blank");
          } else {
            setMessage("התחברו בפייסבוק בחלון שנפתח — נשמור את החשבון אוטומטית");
          }
          resolve();
        });
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(accountId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("להסיר חשבון פייסבוק זה מ-DISTRO?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/facebook/accounts/${accountId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as {
        success: boolean;
        accounts?: FacebookAccountListItem[];
      };
      if (res.ok && data.success) {
        setAccounts(data.accounts || []);
        setMessage("החשבון הוסר");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading && accounts.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl px-3 py-3 text-[11px]",
          isLight
            ? "border border-slate-200 bg-slate-50 text-slate-500"
            : "bg-[#1e293b] text-slate-400",
          className
        )}
      >
        {t("loadingAccounts")}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative z-20", className)} dir={dir}>
      <button
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-start transition",
          isLight
            ? "border-slate-200 bg-white hover:bg-slate-50"
            : "border-white/10 bg-[#1e293b] hover:bg-[#243447]"
        )}
      >
        {active ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className={cn(
                  "h-10 w-10 rounded-full border object-cover",
                  isLight
                    ? "border-[#3B82F6]/40 bg-slate-100"
                    : "border-[#3B82F6]/60 bg-slate-700"
                )}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span
                className={cn(
                  "absolute bottom-0 end-0 h-3 w-3 rounded-full border-2 bg-[#10B981]",
                  isLight ? "border-white" : "border-[#1e293b]"
                )}
              />
            </div>
            <div className="min-w-0">
              <span
                className={cn(
                  "block max-w-[160px] truncate text-xs font-semibold",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                {active.name}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isLight ? "text-[#10B981]" : "text-green-400"
                )}
              >
                {t("locallyConnected")}
              </span>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 text-xs",
              isLight ? "text-slate-500" : "text-slate-400"
            )}
          >
            <UserRound className="h-4 w-4" />
            {t("notConnected")}
          </div>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-full overflow-hidden rounded-xl border shadow-xl",
            menuPlacement === "down" ? "top-full mt-2" : "bottom-full mb-2",
            isLight
              ? "border-slate-200 bg-white"
              : "border-white/10 bg-[#0f172a]"
          )}
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-1 px-1">
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => void switchTo(acc.id)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-right",
                    isLight ? "hover:bg-slate-50" : "hover:bg-white/5",
                    acc.isActive && (isLight ? "bg-sky-50" : "bg-white/5")
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={acc.avatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className={cn(
                      "h-8 w-8 shrink-0 rounded-full object-cover",
                      isLight ? "bg-slate-100" : "bg-slate-700"
                    )}
                  />
                  <span className="min-w-0 flex-1 text-start">
                    <span
                      className={cn(
                        "block truncate text-xs font-medium",
                        isLight ? "text-slate-900" : "text-slate-100"
                      )}
                    >
                      {acc.name}
                    </span>
                    <span
                      className={cn(
                        "block text-[10px]",
                        isLight ? "text-slate-500" : "text-slate-400"
                      )}
                    >
                      {typeof acc.groupCount === "number"
                        ? t("groupsCount", { n: acc.groupCount })
                        : "—"}
                    </span>
                  </span>
                  {acc.isActive && (
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isLight ? "text-[#10B981]" : "text-green-400"
                      )}
                    />
                  )}
                </button>
                <button
                  type="button"
                  title={t("removeAccount")}
                  disabled={busy}
                  onClick={(e) => void removeAccount(acc.id, e)}
                  className={cn(
                    "rounded-lg p-1.5",
                    isLight
                      ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      : "text-slate-500 hover:bg-red-950/50 hover:text-red-300"
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="px-3 py-3 text-[11px] text-slate-500">
                {t("noAccountsYet")}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addAccount()}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 border-t px-3 py-2.5 text-xs font-semibold disabled:opacity-60",
              isLight
                ? "border-slate-100 text-[#2563EB] hover:bg-sky-50"
                : "border-white/10 text-[#60a5fa] hover:bg-white/5"
            )}
          >
            {busy ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {t("addFacebookAccount")}
          </button>
        </div>
      )}

      {message && (
        <p
          className={cn(
            "mt-2 text-[10px] leading-snug",
            isLight ? "text-amber-700" : "text-amber-300/90"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
