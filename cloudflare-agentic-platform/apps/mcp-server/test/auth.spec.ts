import { describe, it, expect, vi } from "vitest";
import authHandler, { authenticate, restrictScopes, SAFE_DEV_SCOPES } from "../src/auth";
import { escapeHtml } from "../src/auth/escape";

const mockOAuthProvider = () => ({
  parseAuthRequest: vi.fn(async () => ({ clientId: "client-x", state: "abc" })),
  completeAuthorization: vi.fn(async () => ({ redirectTo: "https://example.com/cb" })),
});

const makeReq = (path: string, init?: RequestInit) =>
  new Request(`http://localhost${path}`, init);

describe("authenticate", () => {
  it("unset AUTH_MODE returns 503 (fail-closed)", async () => {
    const c: any = {
      env: {},
      req: { header: vi.fn(() => undefined) },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error.status).toBe(503);
      expect(await r.error.text()).toContain("OAuth not configured");
    }
  });

  it("cloudflare-access without JWT returns 401", async () => {
    const c: any = {
      env: { AUTH_MODE: "cloudflare-access", CF_ACCESS_TEAM_DOMAIN: "x.cloudflareaccess.com", CF_ACCESS_AUD: "aud-x" },
      req: { header: vi.fn(() => undefined) },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error.status).toBe(401);
  });

  it("cloudflare-access without team/aud config returns 500", async () => {
    const c: any = {
      env: { AUTH_MODE: "cloudflare-access" },
      req: { header: vi.fn(() => "fake-jwt") },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error.status).toBe(500);
  });

  it("dev-insecure without DEV_MODE_CONFIRM returns 503", async () => {
    const c: any = {
      env: { AUTH_MODE: "dev-insecure" },
      req: { header: vi.fn(() => undefined) },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error.status).toBe(503);
  });

  it("dev-insecure with correct DEV_MODE_CONFIRM returns dev subject", async () => {
    const c: any = {
      env: { AUTH_MODE: "dev-insecure", DEV_MODE_CONFIRM: "yes-i-know-this-is-insecure" },
      req: { header: vi.fn(() => undefined) },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("subject" in r).toBe(true);
    if ("subject" in r) expect(r.subject.email).toBe("dev-user@local");
  });

  it("unknown AUTH_MODE returns 503", async () => {
    const c: any = {
      env: { AUTH_MODE: "anything-else" },
      req: { header: vi.fn(() => undefined) },
      text: (msg: string, status: number) => new Response(msg, { status }),
    };
    const r = await authenticate(c);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error.status).toBe(503);
  });
});

describe("restrictScopes", () => {
  const ALLOWED = "dns:read,dns:write,waf:read,waf:write,access:read,access:write,observability,github:write,emergency:write";

  it("intersects requested with ALLOWED_SCOPES", () => {
    const r = restrictScopes(
      ["dns:read", "dns:write", "nonexistent:scope" as any],
      { ALLOWED_SCOPES: ALLOWED } as any,
    );
    expect(r).toEqual(["dns:read", "dns:write"]);
  });

  it("dev-insecure further restricts to read-only safe set", () => {
    const r = restrictScopes(
      ["dns:read", "dns:write", "emergency:write", "waf:read", "github:write"],
      { ALLOWED_SCOPES: ALLOWED, AUTH_MODE: "dev-insecure" } as any,
    );
    expect(r.sort()).toEqual(["dns:read", "waf:read"]);
    for (const s of r) expect(SAFE_DEV_SCOPES).toContain(s);
  });

  it("empty ALLOWED_SCOPES drops everything", () => {
    const r = restrictScopes(["dns:read"], { ALLOWED_SCOPES: "" } as any);
    expect(r).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("escapes XSS-relevant characters", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(escapeHtml("'\"<>&")).toBe("&#39;&quot;&lt;&gt;&amp;");
  });
});

describe("/authorize endpoint integration", () => {
  it("returns 503 without AUTH_MODE", async () => {
    const env = { OAUTH_PROVIDER: mockOAuthProvider() } as any;
    const res = await authHandler.fetch(makeReq("/authorize"), env);
    expect(res.status).toBe(503);
  });

  it("returns 401 with AUTH_MODE=cloudflare-access but no JWT", async () => {
    const env = {
      OAUTH_PROVIDER: mockOAuthProvider(),
      AUTH_MODE: "cloudflare-access",
      CF_ACCESS_TEAM_DOMAIN: "x.cloudflareaccess.com",
      CF_ACCESS_AUD: "aud-x",
    } as any;
    const res = await authHandler.fetch(makeReq("/authorize"), env);
    expect(res.status).toBe(401);
  });

  it("/authorize/approve returns 503 without AUTH_MODE (no token issued)", async () => {
    const env = { OAUTH_PROVIDER: mockOAuthProvider() } as any;
    const body = new URLSearchParams();
    body.append("scope", "emergency:write");
    body.append("scope", "dns:write");
    const res = await authHandler.fetch(
      makeReq("/authorize/approve", { method: "POST", body }),
      env,
    );
    expect(res.status).toBe(503);
    expect(env.OAUTH_PROVIDER.completeAuthorization).not.toHaveBeenCalled();
  });

  it("consent screen renders with CSP header and escapes clientId/state", async () => {
    const provider = mockOAuthProvider();
    provider.parseAuthRequest = vi.fn(async () => ({
      clientId: '<script>alert(1)</script>',
      state: '"><img src=x>',
    }));
    const env = {
      OAUTH_PROVIDER: provider,
      AUTH_MODE: "dev-insecure",
      DEV_MODE_CONFIRM: "yes-i-know-this-is-insecure",
    } as any;
    const res = await authHandler.fetch(makeReq("/authorize"), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toContain("script-src 'none'");
    const html = await res.text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain('"><img src=x>');
    expect(html).toContain("&quot;&gt;&lt;img src=x&gt;");
  });
});
