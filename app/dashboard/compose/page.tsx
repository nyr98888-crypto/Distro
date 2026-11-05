import { redirect } from "next/navigation";
import { PostComposer } from "@/components/dashboard/post-composer";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const userId = await getAuthenticatedUserId();
  const isProd = process.env.NODE_ENV === "production";

  if (!userId && isProd) {
    redirect("/signin");
  }

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];

  if (userId) {
    accountId = await getActiveAccountId(userId);
    if (accountId) {
      channels = await listChannelsForAccount(accountId);
    }
  }

  const needsLogin = !userId || !accountId;
  const allowDevLogin = !isProd;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-right sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          יצירת פוסט ותזמון
        </h1>
        <p className="text-sm text-muted-foreground">
          זיהוי עדיפות אוטומטי מזהה פוסטים דחופים לפני הכניסה לתור.
        </p>
      </header>

      {needsLogin && allowDevLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}

      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <PostComposer accountId={accountId} channels={channels} />
      </div>
    </div>
  );
}
