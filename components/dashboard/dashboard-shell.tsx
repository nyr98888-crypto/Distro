"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutTemplate,
  Menu,
  Megaphone,
  Settings,
  Users,
  X,
} from "lucide-react";
import { ExtensionInstallButton } from "@/components/dashboard/extension-install-button";
import { FacebookAccountBar } from "@/components/dashboard/facebook-account-bar";
import { SidebarHeader } from "@/components/dashboard/sidebar-header";
import {
  I18nProvider,
  LanguageToggle,
  useI18n,
  type TranslationKey,
} from "@/lib/i18n";
import { supportHref } from "@/lib/support";
import { cn } from "@/lib/utils";

const NAV = [
  {
    href: "/dashboard/campaigns",
    key: "navCampaigns" as const,
    icon: Megaphone,
    match: (p: string) =>
      p.startsWith("/dashboard/campaigns") ||
      p.startsWith("/dashboard/compose") ||
      p === "/dashboard",
  },
  {
    href: "/dashboard/channels",
    key: "navGroups" as const,
    icon: Users,
    match: (p: string) => p.startsWith("/dashboard/channels"),
  },
  {
    href: "/dashboard/presets",
    key: "navTemplates" as const,
    icon: LayoutTemplate,
    match: (p: string) => p.startsWith("/dashboard/presets"),
  },
  {
    href: "/dashboard/calendar",
    key: "navActivity" as const,
    icon: CalendarDays,
    match: (p: string) => p.startsWith("/dashboard/calendar"),
  },
  {
    href: "/dashboard/settings",
    key: "navSettings" as const,
    icon: Settings,
    match: (p: string) => p.startsWith("/dashboard/settings"),
  },
] as const;

type DashboardShellProps = {
  children: React.ReactNode;
  userName?: string | null;
  avatarUrl?: string | null;
};

type SidebarProps = {
  pathname: string;
  isRtl: boolean;
  userName?: string | null;
  avatarUrl?: string | null;
  support: string;
  t: (key: TranslationKey) => string;
};

/** Separate component so desktop + mobile each get their own hook instances. */
function DashboardSidebar({
  pathname,
  isRtl,
  userName,
  avatarUrl,
  support,
  t,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-[260px] flex-col border-slate-200 bg-white text-slate-700",
        isRtl ? "border-l" : "border-r"
      )}
    >
      <SidebarHeader />

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-[#EFF6FF] text-[#2563EB] shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  active ? "text-[#3B82F6]" : "text-slate-400"
                )}
              />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-100 px-4 py-4">
        <FacebookAccountBar variant="light" menuPlacement="up" />
        {(userName || avatarUrl) && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-slate-200 bg-slate-100 object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p
                className="truncate text-xs font-semibold text-slate-800"
                title={userName || undefined}
              >
                {userName || "—"}
              </p>
              <p className="text-[10px] font-medium text-[#10B981]">
                {t("connectedActive")}
              </p>
            </div>
          </div>
        )}
        <ExtensionInstallButton />
        <a
          href={support}
          target={support.startsWith("http") ? "_blank" : undefined}
          rel={support.startsWith("http") ? "noopener noreferrer" : undefined}
          className="block text-[11px] text-slate-400 hover:text-[#2563EB]"
        >
          {t("support")}
        </a>
      </div>
    </aside>
  );
}

function ShellInner({
  children,
  userName,
  avatarUrl,
}: DashboardShellProps) {
  const pathname = usePathname() || "";
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { dir, locale, t } = useI18n();
  const isRtl = dir === "rtl";
  const support = supportHref(locale || "he") || "mailto:support@distro.app";

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const sidebarProps: SidebarProps = {
    pathname,
    isRtl,
    userName,
    avatarUrl,
    support,
    t,
  };

  return (
    <div
      dir={dir}
      lang={locale}
      className="flex min-h-screen bg-[#F8FAFC] font-sans text-slate-900"
    >
      {/* Desktop fixed sidebar — own component instance */}
      <div
        className={cn(
          "fixed inset-y-0 z-40 hidden md:block",
          isRtl ? "right-0" : "left-0"
        )}
      >
        <DashboardSidebar {...sidebarProps} />
      </div>

      {/* Mobile drawer — separate instance (never reuse one React element) */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            aria-label={t("closeMenu")}
            onClick={() => setMobileOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-y-0 shadow-2xl",
              isRtl ? "right-0" : "left-0"
            )}
          >
            <DashboardSidebar {...sidebarProps} />
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex min-h-screen w-full flex-col",
          isRtl ? "md:pr-[260px]" : "md:pl-[260px]"
        )}
      >
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F8FAFC]/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm md:hidden"
              aria-label={t("menu")}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <LanguageToggle />
          </div>
          <span className="text-sm font-bold tracking-wide text-slate-800 md:hidden">
            DISTRO
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline md:ms-auto">
            v1.0.0 Beta
          </span>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <I18nProvider>
      <ShellInner {...props} />
    </I18nProvider>
  );
}
