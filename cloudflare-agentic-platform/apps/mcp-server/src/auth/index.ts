/**
 * OAuth handler.
 *
 * Modos (env var AUTH_MODE):
 *  - "cloudflare-access" (recomendado): valida JWT do header Cf-Access-Jwt-Assertion
 *    via JWKS do team Access. Email do usuário vem da claim "email".
 *  - "dev-insecure" (apenas dev): aceita request sem auth, mas exige DEV_MODE_CONFIRM
 *    setado como "yes-i-know-this-is-insecure" e restringe scopes a um whitelist read-only.
 *  - unset/qualquer outro: fail-closed (503).
 *
 * Scopes pedidos via form são interseccionados com ALLOWED_SCOPES.
 */

import { Hono } from "hono";
import type { Scope } from "../types";
import { verifyAccessJwt } from "./access-jwt";
import { escapeHtml } from "./escape";

type Bindings = {
  OAUTH_PROVIDER: {
    parseAuthRequest(req: Request): Promise<any>;
    completeAuthorization(opts: {
      request: any;
      userId: string;
      metadata: Record<string, unknown>;
      scope: string[];
      props: Record<string, unknown>;
    }): Promise<{ redirectTo: string }>;
  };
  AUTH_MODE?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  DEV_MODE_CONFIRM?: string;
  ALLOWED_SCOPES?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

const SAFE_DEV_SCOPES: Scope[] = ["dns:read", "waf:read", "access:read", "observability"];
const CONSENT_CSP = "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; form-action 'self'";

interface AuthSubject { email: string; sub: string }

async function authenticate(c: any): Promise<{ subject: AuthSubject } | { error: Response }> {
  const mode = c.env.AUTH_MODE;

  if (mode === "cloudflare-access") {
    const team = c.env.CF_ACCESS_TEAM_DOMAIN;
    const aud = c.env.CF_ACCESS_AUD;
    if (!team || !aud) {
      return { error: c.text("Server misconfigured: CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD missing", 500) };
    }
    const jwt = c.req.header("Cf-Access-Jwt-Assertion");
    if (!jwt) return { error: c.text("Unauthorized: missing Cloudflare Access JWT", 401) };
    const claims = await verifyAccessJwt(jwt, team, aud);
    if (!claims) return { error: c.text("Unauthorized: invalid Access JWT", 401) };
    return { subject: { sub: claims.sub, email: claims.email } };
  }

  if (mode === "dev-insecure") {
    if (c.env.DEV_MODE_CONFIRM !== "yes-i-know-this-is-insecure") {
      return { error: c.text("dev-insecure requires DEV_MODE_CONFIRM=yes-i-know-this-is-insecure", 503) };
    }
    return { subject: { sub: "dev-user@local", email: "dev-user@local" } };
  }

  return { error: c.text("OAuth not configured. Set AUTH_MODE=cloudflare-access (see SETUP.md)", 503) };
}

function parseAllowedScopes(env: Bindings): Set<Scope> {
  const raw = env.ALLOWED_SCOPES ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean) as Scope[]);
}

function restrictScopes(requested: Scope[], env: Bindings): Scope[] {
  const allowed = parseAllowedScopes(env);
  const intersected = requested.filter((s) => allowed.has(s));
  if (env.AUTH_MODE === "dev-insecure") {
    return intersected.filter((s) => SAFE_DEV_SCOPES.includes(s));
  }
  return intersected;
}

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("Cloudflare Ops MCP Server. Veja /authorize."));

app.get("/authorize", async (c) => {
  const auth = await authenticate(c);
  if ("error" in auth) return auth.error;

  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const clientId = escapeHtml(String(oauthReq.clientId ?? ""));
  const state = escapeHtml(String(oauthReq.state ?? ""));
  const email = escapeHtml(auth.subject.email);
  const modeLabel = c.env.AUTH_MODE === "dev-insecure"
    ? '<p style="color:#c00">⚠️ dev-insecure: scopes write/emergency desativados.</p>'
    : "";

  const html = `<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Autorizar MCP</title></head>
<body style="font-family: system-ui; max-width: 480px; margin: 4rem auto;">
  <h1>Autorizar acesso</h1>
  <p>Usuário: <code>${email}</code></p>
  <p>Cliente: <code>${clientId}</code></p>
  ${modeLabel}
  <form method="post" action="/authorize/approve">
    <input type="hidden" name="state" value="${state}">
    <fieldset>
      <legend>Scopes:</legend>
      <label><input type="checkbox" name="scope" value="dns:read" checked> dns:read</label><br>
      <label><input type="checkbox" name="scope" value="dns:write"> dns:write</label><br>
      <label><input type="checkbox" name="scope" value="waf:read" checked> waf:read</label><br>
      <label><input type="checkbox" name="scope" value="waf:write"> waf:write</label><br>
      <label><input type="checkbox" name="scope" value="access:read"> access:read</label><br>
      <label><input type="checkbox" name="scope" value="access:write"> access:write</label><br>
      <label><input type="checkbox" name="scope" value="observability" checked> observability</label><br>
      <label><input type="checkbox" name="scope" value="github:write"> github:write</label><br>
      <label><input type="checkbox" name="scope" value="emergency:write"> emergency:write</label><br>
    </fieldset>
    <button type="submit">Autorizar</button>
  </form>
</body></html>`;

  c.header("Content-Security-Policy", CONSENT_CSP);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  return c.html(html);
});

app.post("/authorize/approve", async (c) => {
  const auth = await authenticate(c);
  if ("error" in auth) return auth.error;

  const form = await c.req.formData();
  const requested = form.getAll("scope").map(String) as Scope[];
  const scopes = restrictScopes(requested, c.env);
  if (scopes.length === 0) {
    return c.text("No allowed scopes requested", 400);
  }

  const cfToken = c.env.CLOUDFLARE_API_TOKEN ?? "DEV_NO_TOKEN";
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId: auth.subject.sub,
    metadata: { label: auth.subject.email },
    scope: scopes,
    props: { sub: auth.subject.sub, email: auth.subject.email, scopes, cfToken },
  });

  return c.redirect(redirectTo);
});

export default app;
export { authenticate, restrictScopes, SAFE_DEV_SCOPES };
