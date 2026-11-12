import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";
import { upsertFacebookAccount } from "@/lib/facebook-accounts";

const GRAPH_VERSION = "v21.0";
const STATE_COOKIE = "distro_fb_oauth_state";
const REDIRECT_COOKIE = "distro_fb_oauth_redirect";
const POST_LOGIN_COOKIE = "distro_fb_oauth_next";
const STATE_MAX_AGE = 60 * 10; // 10 minutes
const DEFAULT_POST_LOGIN_PATH = "/dashboard/channels";

export {
  STATE_COOKIE,
  REDIRECT_COOKIE,
  POST_LOGIN_COOKIE,
  STATE_MAX_AGE,
  GRAPH_VERSION,
  DEFAULT_POST_LOGIN_PATH,
};

/** Only allow same-origin relative paths (open-redirect safe). */
export function sanitizePostLoginPath(
  raw: string | null | undefined
): string {
  if (!raw) return DEFAULT_POST_LOGIN_PATH;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (trimmed.includes("://") || trimmed.includes("\\")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return trimmed;
}

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
    // Basic scopes only — pages_* require App Review and fail in development.
    // Graph sync still attempts /me/groups + /me/accounts with whatever Meta grants.
    scope: "public_profile,email",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

type FacebookTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
};

/** Exchange a short-lived user token for a long-lived (~60 day) token. */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<string> {
  const { clientId, clientSecret } = getFacebookCredentials();
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`
  );
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("fb_exchange_token", shortLivedToken);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = (await res.json()) as FacebookTokenResponse;
  if (!res.ok || !json.access_token) {
    console.warn(
      "[facebook-oauth] long-lived token exchange failed:",
      json.error?.message || `HTTP ${res.status}`
    );
    return shortLivedToken;
  }
  return json.access_token;
}

type FacebookProfile = {
  id: string;
  name?: string;
  email?: string;
  pictureUrl?: string;
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

  const accessToken = await exchangeForLongLivedToken(tokenJson.access_token);

  const meUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
  meUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
  meUrl.searchParams.set("access_token", accessToken);

  const meRes = await fetch(meUrl.toString(), { method: "GET" });
  const profile = (await meRes.json()) as FacebookProfile & {
    picture?: { data?: { url?: string } };
    error?: { message?: string };
  };
  if (!meRes.ok || !profile.id) {
    throw new Error(
      profile.error?.message ||
        `Facebook profile fetch failed (${meRes.status})`
    );
  }

  return {
    accessToken,
    profile: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      pictureUrl: profile.picture?.data?.url,
    },
  };
}

type GraphGroup = {
  id: string;
  name?: string;
  privacy?: string;
  member_count?: number;
};

async function upsertChannelFromGraph(
  accountId: string,
  item: { id: string; name: string; memberCount?: number; url: string; tag?: string }
): Promise<boolean> {
  const existing = await db.channel.findFirst({
    where: { accountId, externalId: item.id },
    select: { id: true, categoryTags: true },
  });
  const tags = item.tag ? JSON.stringify([item.tag]) : "[]";
  if (existing) {
    await db.channel.update({
      where: { id: existing.id },
      data: {
        name: item.name,
        memberCount: item.memberCount ?? 0,
        isActive: true,
        url: item.url,
        ...(item.tag && !String(existing.categoryTags || "").includes(item.tag)
          ? { categoryTags: tags }
          : {}),
      },
    });
  } else {
    await db.channel.create({
      data: {
        accountId,
        externalId: item.id,
        name: item.name,
        memberCount: item.memberCount ?? 0,
        isActive: true,
        url: item.url,
        categoryTags: tags,
        isApprovalRequired: false,
      },
    });
  }
  return true;
}

/**
 * Best-effort group + page sync via Graph API.
 * With only public_profile,email these calls often lack permission —
 * each fetch is isolated so login / sync still succeeds from /me alone.
 */
export async function syncGroupsFromGraph(
  accountId: string,
  oauthAccessToken: string
): Promise<number> {
  let upserted = 0;

  try {
    const groupUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/groups`
    );
    groupUrl.searchParams.set("fields", "id,name,privacy,member_count");
    groupUrl.searchParams.set("limit", "100");
    groupUrl.searchParams.set("access_token", oauthAccessToken);

    const groupRes = await fetch(groupUrl.toString(), { method: "GET" });
    const groupJson = (await groupRes.json()) as {
      data?: GraphGroup[];
      error?: { message?: string };
    };
    if (!groupRes.ok || groupJson.error) {
      console.warn(
        "[facebook-oauth] groups sync skipped:",
        groupJson.error?.message || `HTTP ${groupRes.status}`
      );
    } else {
      for (const group of groupJson.data || []) {
        if (!group.id) continue;
        await upsertChannelFromGraph(accountId, {
          id: group.id,
          name: (group.name || `Group ${group.id}`).trim(),
          memberCount: group.member_count ?? 0,
          url: `https://www.facebook.com/groups/${group.id}`,
          tag: "group",
        });
        upserted += 1;
      }
    }
  } catch (error) {
    console.warn("[facebook-oauth] /me/groups error:", error);
  }

  try {
    const pagesUrl = new URL(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`
    );
    pagesUrl.searchParams.set("fields", "id,name,fan_count,link");
    pagesUrl.searchParams.set("limit", "100");
    pagesUrl.searchParams.set("access_token", oauthAccessToken);

    const pagesRes = await fetch(pagesUrl.toString(), { method: "GET" });
    const pagesJson = (await pagesRes.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        fan_count?: number;
        link?: string;
      }>;
      error?: { message?: string };
    };
    if (!pagesRes.ok || pagesJson.error) {
      console.warn(
        "[facebook-oauth] pages sync skipped:",
        pagesJson.error?.message || `HTTP ${pagesRes.status}`
      );
    } else {
      for (const page of pagesJson.data || []) {
        if (!page.id) continue;
        await upsertChannelFromGraph(accountId, {
          id: page.id,
          name: (page.name || `Page ${page.id}`).trim(),
          memberCount: page.fan_count ?? 0,
          url: page.link || `https://www.facebook.com/${page.id}`,
          tag: "page",
        });
        upserted += 1;
      }
    }
  } catch (error) {
    console.warn("[facebook-oauth] /me/accounts error:", error);
  }

  return upserted;
}

/** Refresh profile fields from Graph using a stored user access token. */
export async function fetchFacebookProfile(
  oauthAccessToken: string
): Promise<FacebookProfile | null> {
  try {
    const meUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
    meUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
    meUrl.searchParams.set("access_token", oauthAccessToken);
    const meRes = await fetch(meUrl.toString(), { method: "GET" });
    const profile = (await meRes.json()) as FacebookProfile & {
      picture?: { data?: { url?: string } };
      error?: { message?: string };
    };
    if (!meRes.ok || !profile.id) {
      console.warn(
        "[facebook-oauth] profile refresh failed:",
        profile.error?.message || `HTTP ${meRes.status}`
      );
      return null;
    }
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      pictureUrl: profile.picture?.data?.url,
    };
  } catch (error) {
    console.warn("[facebook-oauth] profile refresh error:", error);
    return null;
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
 * When linkToUserId is set (existing distro_user_id cookie), attach Facebook
 * to that user so session cookie and ConnectedAccount never diverge.
 */
export async function completeFacebookWebLogin(input: {
  profile: FacebookProfile;
  accessToken: string;
  linkToUserId?: string | null;
}): Promise<{
  userId: string;
  accountId: string;
  groupCount: number;
}> {
  await ensureAuthSchema();

  const facebookId = input.profile.id;
  const name = (input.profile.name || "").trim();
  const emailFromFb = (input.profile.email || "").trim().toLowerCase();

  let user: { id: string; email: string; name: string };

  if (input.linkToUserId) {
    const sessionUser = await db.user.findUnique({
      where: { id: input.linkToUserId },
      select: { id: true, email: true, name: true },
    });
    if (sessionUser) {
      // Free facebookId unique slot if another row owns it.
      const other = await db.user.findFirst({
        where: { facebookId },
        select: { id: true },
      });
      if (other && other.id !== sessionUser.id) {
        await db.user.update({
          where: { id: other.id },
          data: { facebookId: null },
        });
      }
      user = await db.user.update({
        where: { id: sessionUser.id },
        data: {
          facebookId,
          name: name || sessionUser.name,
          ...(emailFromFb ? { email: emailFromFb } : {}),
        },
        select: { id: true, email: true, name: true },
      });
    } else {
      user = await upsertUserFromFacebook(input.profile);
    }
  } else {
    user = await upsertUserFromFacebook(input.profile);
  }

  const displayName = (input.profile.name || user.name || "").trim();
  const avatarUrl =
    input.profile.pictureUrl ||
    `https://graph.facebook.com/${facebookId}/picture?type=large`;

  if (!input.accessToken) {
    throw new Error("Cannot save ConnectedAccount without access token");
  }

  const account = await upsertFacebookAccount({
    userId: user.id,
    facebookId,
    name: displayName || `Facebook ${facebookId.slice(-4)}`,
    avatarUrl,
    oauthAccessToken: input.accessToken,
    source: "facebook-oauth",
    makeActive: true,
  });

  if (!account?.id) {
    throw new Error("ConnectedAccount upsert returned no id");
  }

  // Best-effort channel sync — missing /me/groups|/me/accounts perms must not fail login.
  let groupCount = 0;
  try {
    groupCount = await syncGroupsFromGraph(account.id, input.accessToken);
  } catch (error) {
    console.warn(
      "[facebook-oauth] post-login Graph sync skipped:",
      error
    );
  }

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
