import Image from "next/image";
import Link from "next/link";

const SUPPORT_EMAIL = "support@distro.app";

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.18),_transparent_55%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(248,250,252,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(248,250,252,0.5)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Distro"
            width={40}
            height={40}
            className="rounded-md border border-slate-700 object-contain"
            priority
          />
          <span className="text-lg font-semibold tracking-[0.2em]">DISTRO</span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-slate-300">
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="transition hover:text-white"
          >
            Support
          </a>
          <Link
            href="/login"
            className="rounded-md bg-sky-400 px-3 py-1.5 font-medium text-slate-950 transition hover:bg-sky-300"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 pb-20 pt-16 md:pt-24">
        <div className="max-w-2xl space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-sky-300/90">
            Facebook group scheduling
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            DISTRO
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-slate-300">
            Sync your joined Facebook groups into a personal dashboard, then
            compose and schedule posts across communities — without sharing
            passwords or selling your data.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-md bg-sky-400 px-5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              Get started
            </Link>
            <Link
              href="/privacy"
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-600 px-5 text-sm font-medium text-slate-100 transition hover:border-slate-400"
            >
              Privacy policy
            </Link>
          </div>
        </div>

        <section className="grid gap-4 border-t border-slate-800 pt-10 md:grid-cols-3">
          {[
            {
              title: "Sync groups",
              body: "The Chrome extension reads group names and IDs from your joined groups page when you click Sync.",
            },
            {
              title: "Plan posts",
              body: "Use the Distro dashboard to draft content and schedule distribution to selected communities.",
            },
            {
              title: "Your data stays yours",
              body: "No Facebook passwords, DMs, or payment data are collected. Nothing is sold to third parties.",
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <h2 className="text-base font-semibold text-white">{item.title}</h2>
              <p className="text-sm leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-slate-800 pt-8 text-sm text-slate-400">
          <p>
            Support:{" "}
            <a
              className="text-sky-300 underline-offset-2 hover:underline"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
          <p className="mt-2">
            <Link href="/privacy" className="hover:text-slate-200">
              Privacy Policy
            </Link>
            {" · "}
            <Link href="/login" className="hover:text-slate-200">
              Sign in
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
