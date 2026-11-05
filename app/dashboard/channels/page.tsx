import {
  getActiveAccountId,
  listChannelsForAccount,
} from "@/lib/channels";
import { getAuthenticatedUserId } from "@/lib/auth";
import { DevLoginButton } from "@/components/dashboard/dev-login-button";
import { ChannelsClient } from "./channels-client";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const userId = await getAuthenticatedUserId();

  let accountId: string | null = null;
  let channels: Awaited<ReturnType<typeof listChannelsForAccount>> = [];

  if (userId) {
    accountId = await getActiveAccountId(userId);
    if (accountId) {
      channels = await listChannelsForAccount(accountId);
    }
  }

  const needsLogin = !userId || !accountId;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-right sm:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          ערוצי יעד וקבוצות
        </h1>
        <p className="text-sm text-muted-foreground">
          חפשו, תייגו והפעילו את הקבוצות שאליהן ListPilot יכול לפרסם.
        </p>
      </header>

      {needsLogin && (
        <DevLoginButton autoLogin={process.env.NODE_ENV === "development"} />
      )}

      {userId && !accountId && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          אין חשבון מחובר פעיל. התחברו כמשתמש בדיקה או סנכרנו סשן דרך{" "}
          <code className="rounded bg-muted px-1">/api/session/sync</code>.
        </div>
      )}

      <ChannelsClient accountId={accountId} initialChannels={channels} />
    </div>
  );
}
