"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChannelDTO } from "@/lib/channels-shared";
import { CampaignWizard } from "@/components/dashboard/campaign-wizard";
import { ActiveCampaigns } from "@/components/dashboard/active-campaigns";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "create" | "manage";

type CampaignStudioProps = {
  channels: ChannelDTO[];
  accountId: string | null;
};

export function CampaignStudio({ channels, accountId }: CampaignStudioProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dir, locale } = useI18n();
  const editId = searchParams.get("edit");
  const dateParam = searchParams.get("date");
  const tabParam = searchParams.get("tab");

  const [tab, setTab] = React.useState<Tab>(() =>
    editId ? "create" : tabParam === "manage" ? "manage" : "create"
  );
  const [editPostId, setEditPostId] = React.useState<string | null>(editId);
  const [wizardKey, setWizardKey] = React.useState(0);

  React.useEffect(() => {
    if (editId) {
      setEditPostId(editId);
      setTab("create");
      setWizardKey((k) => k + 1);
      return;
    }
    if (tabParam === "manage") setTab("manage");
  }, [editId, tabParam]);

  function openCreate() {
    setEditPostId(null);
    setTab("create");
    setWizardKey((k) => k + 1);
    router.replace("/dashboard/compose");
  }

  function openManage() {
    setTab("manage");
    router.replace("/dashboard/compose?tab=manage");
  }

  function handleEdit(id: string) {
    setEditPostId(id);
    setTab("create");
    setWizardKey((k) => k + 1);
    router.replace(`/dashboard/compose?edit=${id}`);
  }

  return (
    <div dir={dir} className="mx-auto max-w-4xl space-y-6 text-start">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {locale === "he" ? "סטודיו קמפיינים" : "Campaign Studio"}
        </h1>
        <p className="text-sm text-slate-500">
          {locale === "he"
            ? "צרו קמפיין ב־3 שלבים, תזמנו פרסום מחזורי, ונהלו פוסטים פעילים ממקום אחד"
            : "Create a campaign in 3 steps, schedule recurring posts, and manage active posts in one place"}
        </p>
      </header>

      <div className="flex gap-1 rounded-2xl border border-[#e4e6eb] bg-[#f0f2f5] p-1">
        <button
          type="button"
          onClick={openCreate}
          className={cn(
            "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            tab === "create"
              ? "bg-white text-[#050505] shadow-sm"
              : "text-[#65676b] hover:text-[#050505]"
          )}
        >
          צור קמפיין חדש
        </button>
        <button
          type="button"
          onClick={openManage}
          className={cn(
            "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
            tab === "manage"
              ? "bg-white text-[#050505] shadow-sm"
              : "text-[#65676b] hover:text-[#050505]"
          )}
        >
          ניהול קמפיינים ופוסטים פעילים
        </button>
      </div>

      {tab === "create" ? (
        <CampaignWizard
          key={wizardKey}
          channels={channels}
          accountId={accountId}
          editPostId={editPostId}
          initialScheduleTime={dateParam}
          initialStep={dateParam && !editPostId ? 3 : 1}
          onSaved={() => {
            if (editPostId) {
              openManage();
            }
          }}
          onCancelEdit={openCreate}
        />
      ) : (
        <ActiveCampaigns
          onEdit={handleEdit}
          onCreateNew={openCreate}
        />
      )}
    </div>
  );
}
