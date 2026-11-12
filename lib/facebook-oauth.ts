import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { upsertFacebookAccount } from "@/lib/facebook-accounts";

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
    // Groups may require App Review; profile+email always work for Login.
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

type GraphGroup = {
  id: string;
  name?: string;
  privacy?: string;
  member_count?: number;
};

/**
 * Best-effort group sync via Graph API.
 * Many consumer apps cannot list joined groups without App Review —
 * failures are logged and ignored so login still succeeds.
 */
export async function syncGroupsFromGraph(
  accountId: string,
  oauthAccessToken: string
): Promise<number> {
  try {
    const url = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/groups`
    );
    url.searchParams.set("fields", "id,name,privacy,member_count");
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", oauthAccessToken);

    const res = await fetch(url.toString(), { method: "GET" });
    const json = (await res.json()) as {
      data?: GraphGroup[];
      error?: { message?: string };
    };
    if (!res.ok || json.error) {
      console.warn(
        "[facebook-oauth] groups sync skipped:",
        json.error?.message || `HTTP ${res.status}`
      );
      return 0;
    }

    const groups = json.data || [];
    let upserted = 0;
    for (const group of groups) {
      if (!group.id) continue;
      const name = (group.name || `Group ${group.id}`).trim();
      const existing = await db.channel.findFirst({
        where: { accountId, externalId: group.id },
        select: { id: true },
      });
      if (existing) {
        await db.channel.update({
          where: { id: existing.id },
          data: {
            name,
            memberCount: group.member_count ?? 0,
            isActive: true,
            url: `https://www.facebook.com/groups/${group.id}`,
          },
        });
      } else {
        await db.channel.create({
          data: {
            accountId,
            externalId: group.id,
            name,
            memberCount: group.member_count ?? 0,
            isActive: true,
            url: `https://www.facebook.com/groups/${group.id}`,
            categoryTags: "[]",
            isApprovalRequired: false,
          },
        });
      }
      upserted += 1;
    }
    return upserted;
  } catch (error) {
    console.warn("[facebook-oauth] groups sync error:", error);
    return 0;
  }
}

/**
 * Find-or-create a Distro user from Facebook Login profile.
 * Links by facebookId first, then by email.
 */
export async function upsertUserFromFacebook(profile: {
  id: string;
  name?: string;
  email?: string;
}): Promise<{ id: string; email: string; name: string }> {
  await ensureAuthSchema();

  const facebookId = profile.id;
  const name = (profile.name || "").trim();
  const email =
    (profile.email || "").trim().toLowerCase() ||
    `fb_${facebookId}@users.distro.app`;

  const existingByFb = await db.user.findFirst({
    where: { facebookId },
    select: { id: true, email: true, name: true },
  });

  if (existingByFb) {
    const updated = await db.user.update({
      where: { id: existingByFb.id },
      data: {
        name: name || existingByFb.name,
        ...(profile.email
          ? { email: profile.email.trim().toLowerCase() }
          : {}),
      },
      select: { id: true, email: true, name: true },
    });
    return updated;
  }

  const existingByEmail = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, facebookId: true },
  });

  if (existingByEmail) {
    const updated = await db.user.update({
      where: { id: existingByEmail.id },
      data: {
        facebookId,
        name: name || existingByEmail.name,
      },
      select: { id: true, email: true, name: true },
    });
    return updated;
  }

  const created = await db.user.create({
    data: {
      email,
      facebookId,
      name,
      passwordHash: null,
    },
    select: { id: true, email: true, name: true },
  });
  return created;
}

/**
 * Full web login: User + ConnectedAccount + optional Graph groups.
 * No Chrome extension required.
 */
export async function completeFacebookWebLogin(input: {
  profile: FacebookProfile;
  accessToken: string;
}): Promise<{
  userId: string;
  accountId: string;
  groupCount: number;
}> {
  await ensureAuthSchema();

  const user = await upsertUserFromFacebook(input.profile);
  const facebookId = input.profile.id;
  const displayName = (input.profile.name || user.name || "").trim();
  const avatarUrl = `https://graph.facebook.com/${facebookId}/picture?type=large`;

  const account = await upsertFacebookAccount({
    userId: user.id,
    facebookId,
    name: displayName || `Facebook ${facebookId.slice(-4)}`,
    avatarUrl,
    oauthAccessToken: input.accessToken,
    source: "facebook-oauth",
    makeActive: true,
  });

  const groupCount = await syncGroupsFromGraph(account.id, input.accessToken);

  await db.connectedAccount.update({
    where: { id: account.id },
    data: { lastSyncedAt: new Date() },
  });

  return {
    userId: user.id,
    accountId: account.id,
    groupCount,
  };
}
