import Link from "next/link";
import { ExtensionInstallButton } from "@/components/dashboard/extension-install-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6 sm:px-6">
          <Link
            href="/dashboard/channels"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            ListPilot
          </Link>
          <Link
            href="/dashboard/channels"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ערוצים וקבוצות
          </Link>
          <Link
            href="/dashboard/compose"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            יצירת פוסט ותזמון
          </Link>
          <ExtensionInstallButton />
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
