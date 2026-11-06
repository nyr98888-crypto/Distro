import Image from "next/image";
import Link from "next/link";
import { ExtensionInstallButton } from "@/components/dashboard/extension-install-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      dir="rtl"
      lang="he"
      className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900"
    >
      <header className="border-b border-slate-800 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/channels"
              className="flex items-center gap-2 transition-opacity hover:opacity-90"
            >
              <Image
                src="/logo.png"
                alt="DISTRO Logo"
                width={36}
                height={36}
                className="rounded-md border border-slate-700/50 object-contain shadow"
                priority
              />
              <span className="bg-gradient-to-l from-slate-100 to-slate-400 bg-clip-text text-xl font-extrabold tracking-wide text-transparent">
                DISTRO
              </span>
            </Link>

            <span className="text-slate-700" aria-hidden>
              |
            </span>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link
                href="/dashboard/channels"
                className="text-slate-300 transition-colors hover:text-white"
              >
                ערוצים וקבוצות
              </Link>
              <Link
                href="/dashboard/compose"
                className="text-slate-300 transition-colors hover:text-white"
              >
                יצירת פוסט ותזמון
              </Link>
              <Link
                href="/privacy"
                className="text-slate-300 transition-colors hover:text-white"
              >
                מדיניות פרטיות
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <ExtensionInstallButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 p-6">{children}</div>
    </div>
  );
}
