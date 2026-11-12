import type { NextRequest } from "next/server";
import { GET as facebookCallbackGet } from "@/app/api/auth/facebook/callback/route";

/**
 * Alias for Meta apps that register the NextAuth-style callback path:
 *   /api/auth/callback/facebook
 *
 * Prefer registering: /api/auth/facebook/callback
 * (that is the redirect_uri used by /api/auth/facebook)
 */
export async function GET(request: NextRequest) {
  return facebookCallbackGet(request);
}
