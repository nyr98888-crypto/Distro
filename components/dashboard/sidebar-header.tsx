"use client";

import Image from "next/image";
import { useI18n } from "@/lib/i18n";

export function SidebarHeader() {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-950 shadow-sm ring-1 ring-slate-200/80">
        <Image
          src="/logo.png"
          alt="DISTRO"
          width={36}
          height={36}
          className="object-contain"
          priority
        />
      </div>
      <div className="min-w-0">
        <span className="block text-lg font-bold tracking-wider text-slate-800">
          DISTRO
        </span>
        <span className="block truncate text-[11px] text-slate-500">
          {t("brandTagline")}
        </span>
      </div>
    </div>
  );
}
