export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans leading-relaxed text-slate-800">
      <h1 className="mb-2 text-3xl font-bold text-slate-900">
        Privacy Policy for DISTRO
      </h1>
      <p className="mb-8 text-sm text-slate-500">Last updated: November 2026</p>

      <p className="mb-6">
        DISTRO (&quot;we&quot;, &quot;our&quot;, or &quot;the extension&quot;) is
        designed with a strict local-first privacy model.
      </p>

      <section className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">1. Information We Access</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>Active Facebook session state to verify authentication.</li>
          <li>
            Group metadata (names and IDs of groups the user has joined).
          </li>
          <li>
            Post content, images, and schedules provided directly by the user.
          </li>
        </ul>
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">2. How Information is Used</h2>
        <p>
          All data handling, Facebook interactions, and automated publishing
          execute strictly within the user&apos;s local browser environment. We
          do not operate external scraping engines.
        </p>
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">
          3. Data Transmission &amp; Third-Party Sharing
        </h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            We DO NOT transmit, store, sell, or monetize user login credentials,
            cookies, or personal Facebook account data to any third-party
            servers.
          </li>
          <li>
            Campaign data and schedules are kept on secure local databases
            strictly to provide campaign functionality to the authenticated
            account owner.
          </li>
        </ul>
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">4. User Control</h2>
        <p>
          Users can disconnect their Facebook profile, delete scheduled
          campaigns, or uninstall the extension at any time to purge all local
          state.
        </p>
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-xl font-semibold">5. Contact</h2>
        <p>
          For inquiries:{" "}
          <a
            className="font-medium text-[#2563EB] hover:underline"
            href="mailto:support@distro.app"
          >
            support@distro.app
          </a>
        </p>
      </section>
    </main>
  );
}
