import type { NextRequest } from "next/server";
import { GET as facebookCallbackGet } from "@/app/api/auth/facebook/callback/route";

/**
 * Alias for Meta apps that register the NextAuth-style callback path.
 * Prefer: /api/auth/facebook/callback (this is what /api/auth/facebook uses).
 */
export async function GET(request: NextRequest) {
  return facebookCallbackGet(request);
}
