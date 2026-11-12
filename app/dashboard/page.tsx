import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Never render dashboard shell HTML for `/dashboard` itself.
 * next.config.ts also redirects here; keep a server redirect as fallback
 * so React never hydrates an empty index (error #418).
 */
export default function DashboardIndexPage() {
  redirect("/dashboard/campaigns");
}
