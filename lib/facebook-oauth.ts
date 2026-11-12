import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";

const GRAPH_VERSION = "v21.0";
const STATE_COOKIE = "distro_fb_oauth_state";
const REDIRECT_COOKIE = "distro_fb_oauth_redirect";
const STATE_MAX_AGE = 60 * 10; // 10 minutes

export { STATE_COOKIE, REDIRECT_COOKIE, STATE_MAX_AGE, GRAPH_VERSION };

function oauthSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.DISTRO_API_KEY ||
    "distro-dev-facebook-oauth"
  );
}

export function getFacebookCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env.FACEBOOK_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.FACEBOOK_CLIENT_SECRET?.trim() || "";
  if (!clientId) {
    throw new Error("FACEBOOK_CLIENT_ID is missing");
  }
  if (!clientSecret) {
    throw new Error("FACEBOOK_CLIENT_SECRET is missing");
  }
  return { clientId, clientSecret };
}

/** Build the OAuth callback URL from the live request origin (localhost or Vercel). */
export function buildFacebookRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/facebook/callback`;
}

export function createOAuthState(): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", oauthSecret())
    .update(nonce)
    .digest("hex");
  return `${nonce}.${sig}`;
}

export function verifyOAuthState(state: string | null | undefined): boolean {
  if (!state) return false;
  const [nonce, sig] = state.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", oauthSecret())
    .update(nonce)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function buildFacebookAuthUrl(
  state: string,
  redirectUri: string
): string {
  const { clientId } = getFacebookCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: "email,public_profile",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type FacebookTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
};

type FacebookProfile = {
  id: string;
  name?: string;
  email?: string;
};

export async function exchangeFacebookCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; profile: FacebookProfile }> {
  const { clientId, clientSecret } = getFacebookCredentials();

  const tokenUrl = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
  );
  tokenUrl.searchParams.set("client_id", clientId);
  tokenUrl.searchParams.set("client_secret", clientSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString(), { method: "GET" });
  const tokenJson = (await tokenRes.json()) as FacebookTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    const detail =
      tokenJson.error?.message ||
      `Facebook token exchange failed (${tokenRes.status})`;
    throw new Error(detail);
  }

  const meUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
  meUrl.searchParams.set("fields", "id,name,email");
  meUrl.searchParams.set("access_token", tokenJson.access_token);

  const meRes = await fetch(meUrl.toString(), { method: "GET" });
  const profile = (await meRes.json()) as FacebookProfile & {
    error?: { message?: string };
  };
  if (!meRes.ok || !profile.id) {
    throw new Error(
      profile.error?.message ||
        `Facebook profile fetch failed (${meRes.status})`
    );
  }

  return {
    accessToken: tokenJson.access_token,
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
    },
  };
}

/**
 * Find-or-create a Distro user from Facebook Login profile.
 * Links by facebookId first, then by email.
 */
export async function upsertUserFromFacebook(profile: {
  id: string;
  name?: string;
  email?: string;
}): Promise<{ id: string; email: string }> {
  await ensureAuthSchema();

  const facebookId = profile.id;
  const name = (profile.name || "").trim();
  const email =
    (profile.email || "").trim().toLowerCase() ||
    `fb_${facebookId}@users.distro.app`;

  const existingByFb = await prisma.user.findFirst({
    where: { facebookId },
    select: { id: true, email: true, name: true },
  });

  if (existingByFb) {
    const updated = await prisma.user.update({
      where: { id: existingByFb.id },
      data: {
        name: name || existingByFb.name,
        ...(profile.email
          ? { email: profile.email.trim().toLowerCase() }
          : {}),
      },
      select: { id: true, email: true },
    });
    return updated;
  }

  const existingByEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, facebookId: true },
  });

  if (existingByEmail) {
    const updated = await prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        facebookId,
        name: name || existingByEmail.name,
      },
      select: { id: true, email: true },
    });
    return updated;
  }

  const created = await prisma.user.create({
    data: {
      email,
      facebookId,
      name,
      passwordHash: null,
    },
    select: { id: true, email: true },
  });
  return created;
}
