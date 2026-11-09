export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans leading-relaxed text-slate-800 dark:text-slate-100">
      <h1 className="mb-4 text-3xl font-bold">Privacy Policy – DISTRO</h1>
      <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
        Last updated: November 2026
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-semibold">1. Overview</h2>
        <p>
          DISTRO is a scheduling and social distribution tool designed to help
          users publish organized updates to their connected Facebook
          communities. We prioritize user privacy, minimal data collection, and
          local processing.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-semibold">
          2. Data Handled by the Chrome Extension
        </h2>
        <p>
          The Distro Chrome Extension accesses Facebook only when explicitly
          triggered by the user:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>
            <strong>Group Identifiers:</strong> Reads group IDs, names, and
            member counts from your joined groups page solely to display them in
            your personal distribution dashboard.
          </li>
          <li>
            <strong>Session Cookies:</strong> Used strictly on your local
            machine to verify your active session. Encrypted tokens are never
            shared with or exposed to third parties.
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-semibold">3. Data Usage & Third Parties</h2>
        <p>
          We do not sell, rent, or trade your personal information. We do not
          transfer your data to data brokers or advertising networks. Data
          stored in your secure workspace is used exclusively to execute your
          requested scheduling jobs.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-semibold">4. Data Deletion</h2>
        <p>
          Users may delete their connected accounts and associated group data at
          any time directly through the dashboard settings or by contacting
          support.
        </p>
      </section>
    </main>
  );
}
