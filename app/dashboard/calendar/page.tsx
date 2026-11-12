import { redirect } from "next/navigation";
import { ContentCalendar } from "@/components/dashboard/content-calendar";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAuthenticatedUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/signin");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titleKey="navActivity"
        subtitleHe="צפו בפוסטים מתוזמנים לפי חודש או שבוע — ערכו או השהו ישירות מהיומן"
        subtitleEn="View scheduled posts by month or week — edit or pause right from the calendar"
      />

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <ContentCalendar />
      </div>
    </div>
  );
}
