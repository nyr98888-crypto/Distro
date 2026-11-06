import Link from "next/link";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
    >
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 text-right shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">התחברות</h1>
          <p className="text-sm text-muted-foreground">
            יש להתחבר כדי לנהל קבוצות ולתזמן פוסטים ב־ListPilot.
          </p>
        </div>

        {isProd ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <p>
              בסביבת ייצור יש להתחבר עם חשבון מאומת. התחברות בדיקה אוטומטית
              אינה זמינה.
            </p>
            <p>
              לאחר התחברות דרך התוסף / סנכרון סשן, חזרו אל{" "}
              <Link
                href="/dashboard/channels"
                className="font-medium text-foreground underline underline-offset-2"
              >
                לוח הבקרה
              </Link>
              .
            </p>
          </div>
        ) : (
          <DevLoginButton autoLogin={false} />
        )}
      </div>
    </div>
  );
}
