import { NextResponse } from "next/server";

const ALLOW_METHODS = "GET,POST,OPTIONS,PATCH";
const ALLOW_HEADERS = "Content-Type, Authorization, x-distro-key";

/** Apply Chrome-extension-friendly CORS headers to an API response. */
export function applyCorsHeaders(res: NextResponse): NextResponse {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.headers.set("Access-Control-Allow-Headers", ALLOW_HEADERS);
  return res;
}

/** Standard CORS preflight for extension / cross-origin clients. */
export function corsPreflight(): NextResponse {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

/** JSON response with CORS headers attached. */
export function corsJson(
  body: unknown,
  init?: ResponseInit
): NextResponse {
  return applyCorsHeaders(NextResponse.json(body, init));
}
