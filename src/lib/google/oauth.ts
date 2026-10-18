import "server-only";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { env } from "@/lib/env";
import { deriveKey } from "@/lib/keys";

import { GoogleError } from "./errors";

// Signing in with Google for Gmail and Calendar (E15-1): the OAuth 2.0
// authorization code flow for a web server app, with offline access so a
// refresh token keeps working after the browser is gone. The state is a
// short-lived token signed with a key from DOSSIER_SECRET, so a callback
// can't be forged from another site.

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const CALLBACK_PATH = "/api/google/callback";

/** What Dossier asks Google for, by feature. */
export const SCOPES = {
  identity: ["openid", "email"],
  send: ["https://www.googleapis.com/auth/gmail.send"],
  read: ["https://www.googleapis.com/auth/gmail.readonly"],
  calendar: ["https://www.googleapis.com/auth/calendar.freebusy", "https://www.googleapis.com/auth/calendar.events"],
} as const;

export type ScopeGroup = keyof typeof SCOPES;

/** Every scope Dossier can use. */
export const ALL_SCOPES: readonly string[] = Object.values(SCOPES).flat();

/** Whether `granted` (space-separated, as Google returns it) covers a feature. */
export function hasScopes(granted: string, group: ScopeGroup): boolean {
  const scopes = new Set(granted.split(/\s+/));
  return SCOPES[group].every((scope) => scopes.has(scope));
}

/** The client from the environment, or null while Google isn't set up. */
export function googleClient(): { id: string; secret: string } | null {
  const id = env.DOSSIER_GOOGLE_CLIENT_ID;
  const secret = env.DOSSIER_GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Where Google sends the browser back to: DOSSIER_PUBLIC_URL, else the address in use. */
export function redirectUri(origin: string): string {
  return `${env.DOSSIER_PUBLIC_URL ?? origin}${CALLBACK_PATH}`;
}

const STATE_AUDIENCE = "dossier-google-oauth";

/** A state that only this server can make, for ten minutes, carrying where to go back to. */
export async function signState(returnTo: string, secret?: string): Promise<string> {
  return new SignJWT({ returnTo })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(STATE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(deriveKey("oauth-state", secret));
}

/** The page to go back to from a valid state; null for a forged or expired one. */
export async function verifyState(state: string | null, { secret, now }: { secret?: string; now?: Date } = {}): Promise<string | null> {
  if (!state) return null;
  try {
    const { payload } = await jwtVerify(state, deriveKey("oauth-state", secret), {
      audience: STATE_AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    });
    return typeof payload.returnTo === "string" && payload.returnTo.startsWith("/") && !payload.returnTo.startsWith("//")
      ? payload.returnTo
      : "/settings?section=google";
  } catch {
    return null;
  }
}

/**
 * Google's consent page for `scopes`. `include_granted_scopes` keeps what was
 * granted before, so features can be added one at a time; `prompt=consent`
 * makes sure a refresh token comes back.
 */
export function authorizeUrl({ clientId, redirect, state, scopes }: { clientId: string; redirect: string; state: string; scopes: readonly string[] }): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: [...new Set(scopes)].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().default(""),
  id_token: z.string().optional(),
});
export type TokenAnswer = z.infer<typeof tokenSchema>;

async function postToken(body: Record<string, string>, signal?: AbortSignal): Promise<TokenAnswer> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: signal ?? AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new GoogleError("unavailable", "Couldn't reach Google. Check the server's connection and try again.");
  }
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    // invalid_grant: the refresh token was revoked, expired or the password changed.
    if (json?.error === "invalid_grant") throw new GoogleError("revoked", "Google no longer accepts Dossier's access. Connect your Google account again.");
    throw new GoogleError("rejected", "Google refused the sign-in. Check DOSSIER_GOOGLE_CLIENT_ID and DOSSIER_GOOGLE_CLIENT_SECRET.");
  }
  const parsed = tokenSchema.safeParse(json);
  if (!parsed.success) throw new GoogleError("unavailable", "Google sent an answer Dossier doesn't understand.");
  return parsed.data;
}

/** Trades the code from the callback for tokens. */
export function exchangeCode(code: string, redirect: string): Promise<TokenAnswer> {
  const client = googleClient();
  if (!client) throw new GoogleError("not-configured", NOT_CONFIGURED);
  return postToken({ code, client_id: client.id, client_secret: client.secret, redirect_uri: redirect, grant_type: "authorization_code" });
}

/** A fresh access token from the refresh token. */
export function refreshAccessToken(refreshToken: string, signal?: AbortSignal): Promise<TokenAnswer> {
  const client = googleClient();
  if (!client) throw new GoogleError("not-configured", NOT_CONFIGURED);
  return postToken({ refresh_token: refreshToken, client_id: client.id, client_secret: client.secret, grant_type: "refresh_token" }, signal);
}

/** Tells Google to forget the grant. Best effort: a token that's already gone is fine. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

/**
 * The address in the ID token. It came straight from Google's token
 * endpoint over TLS, so its signature needn't be checked here (OpenID
 * Connect Core §3.1.3.7).
 */
export function emailFromIdToken(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export const NOT_CONFIGURED =
  "Google isn't set up on this server. Set DOSSIER_GOOGLE_CLIENT_ID and DOSSIER_GOOGLE_CLIENT_SECRET, then restart Dossier.";
