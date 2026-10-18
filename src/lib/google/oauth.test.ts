import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { DOSSIER_SECRET: "x".repeat(40), DOSSIER_PUBLIC_URL: undefined } }));

import { authorizeUrl, emailFromIdToken, hasScopes, redirectUri, SCOPES, signState, verifyState } from "./oauth";

const secret = "a".repeat(40);

describe("OAuth state", () => {
  it("comes back only from this server, within ten minutes", async () => {
    const state = await signState("/settings?section=google", secret);
    expect(await verifyState(state, { secret })).toBe("/settings?section=google");
    expect(await verifyState(state, { secret: "b".repeat(40) })).toBeNull();
    expect(await verifyState(state, { secret, now: new Date(Date.now() + 11 * 60_000) })).toBeNull();
    expect(await verifyState(null, { secret })).toBeNull();
  });

  it("never sends the browser to another site", async () => {
    expect(await verifyState(await signState("//evil.example", secret), { secret })).toBe("/settings?section=google");
  });
});

describe("the consent page", () => {
  it("asks for offline access to the scopes given", () => {
    const url = new URL(authorizeUrl({ clientId: "id", redirect: "https://d.example/api/google/callback", state: "s", scopes: [...SCOPES.identity, ...SCOPES.send, ...SCOPES.send] }));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.send");
    expect(redirectUri("http://localhost:3333")).toBe("http://localhost:3333/api/google/callback");
  });

  it("tells which features were granted", () => {
    const granted = `openid ${SCOPES.send[0]} ${SCOPES.calendar.join(" ")}`;
    expect(hasScopes(granted, "send")).toBe(true);
    expect(hasScopes(granted, "calendar")).toBe(true);
    expect(hasScopes(granted, "read")).toBe(false);
  });

  it("reads the address from the ID token", () => {
    const token = `h.${Buffer.from(JSON.stringify({ email: "jane@gmail.com" })).toString("base64url")}.s`;
    expect(emailFromIdToken(token)).toBe("jane@gmail.com");
    expect(emailFromIdToken("nonsense")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });
});
