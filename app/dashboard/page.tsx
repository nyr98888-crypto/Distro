import { permanentRedirect } from "next/navigation";

/**
 * `/dashboard` must not render layout+empty children (React #418 hydration).
 * next.config.ts also redirects here; this is a belt-and-suspenders fallback.
 */
export default function DashboardIndexPage() {
  permanentRedirect("/dashboard/campaigns");
}
