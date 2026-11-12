import { redirect } from "next/navigation";
import { ExtensionAuthBridge } from "@/components/auth/extension-auth-bridge";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/channels";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { createExtensionSessionToken } from "@/lib/extension-handoff";
import { listFacebookAccounts } from "@/lib/facebook-accounts";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await ensureAuthSchema();
  } catch (error) {
    console.error("[dashboard/layout] schema", error);
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/signin");
  }

  const extensionToken = createExtensionSessionToken(userId);

  let activeAccountName: string | null = null;
  let activeAccountAvatar: string | null = null;

  try {
    const accounts = (await listFacebookAccounts(userId)) || [];
    const activeId = await getActiveAccountId(userId);
    const active =
      accounts.find((a) => a.id === activeId) ||
      accounts.find((a) => a.isActive) ||
      accounts[0] ||
      null;
    if (active) {
      activeAccountName = active.name || null;
      activeAccountAvatar = active.avatarUrl || null;
    }
  } catch (error) {
    // New accounts / empty Turso state must never blank the dashboard shell.
    console.error("[dashboard/layout] account load", error);
  }

  return (
    <>
      <ExtensionAuthBridge token={extensionToken} userId={userId} />
      <DashboardShell
        userName={activeAccountName}
        avatarUrl={activeAccountAvatar}
      >
        {children}
      </DashboardShell>
    </>
  );
}
