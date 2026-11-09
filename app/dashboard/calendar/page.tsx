import { redirect } from "next/navigation";
import { ContentCalendar } from "@/components/dashboard/content-calendar";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { getAuthenticatedUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const userId = await getAuthenticatedUserId();
  const allowDevLogin =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_DEV_LOGIN === "true";

  if (!userId && !allowDevLogin) {
    redirect("/signin");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        titleKey="navActivity"
        subtitleHe="צפו בפוסטים מתוזמנים לפי חודש או שבוע — ערכו או השהו ישירות מהיומן"
        subtitleEn="View scheduled posts by month or week — edit or pause right from the calendar"
      />

      {!userId && allowDevLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <ContentCalendar />
      </div>
    </div>
  );
}
