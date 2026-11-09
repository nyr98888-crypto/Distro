import { ExtensionAuthBridge } from "@/components/auth/extension-auth-bridge";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getActiveAccountId } from "@/lib/channels";
import { listFacebookAccounts } from "@/lib/facebook-accounts";
import { createExtensionSessionToken } from "@/lib/extension-handoff";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getAuthenticatedUserId();
  const extensionToken = userId ? createExtensionSessionToken(userId) : null;

  let activeAccountName: string | null = null;
  let activeAccountAvatar: string | null = null;

  if (userId) {
    const accounts = await listFacebookAccounts(userId);
    const activeId = await getActiveAccountId(userId);
    const active =
      accounts.find((a) => a.id === activeId) ||
      accounts.find((a) => a.isActive) ||
      accounts[0] ||
      null;
    if (active) {
      activeAccountName = active.name;
      activeAccountAvatar = active.avatarUrl || null;
    }
  }

  return (
    <>
      <ExtensionAuthBridge token={extensionToken} />
      <DashboardShell
        userName={activeAccountName}
        avatarUrl={activeAccountAvatar}
      >
        {children}
      </DashboardShell>
    </>
  );
}
