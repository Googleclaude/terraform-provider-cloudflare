/**
 * OAuth handler. Em produção, esta camada delega ao Cloudflare Access
 * via OIDC. Em dev, exibe uma página simples para escolher scopes.
 */

import { Hono } from "hono";
import type { Scope } from "../types";

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
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => c.text("Cloudflare Ops MCP Server. Veja /authorize."));

app.get("/authorize", async (c) => {
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  // Em produção: redirecionar para Cloudflare Access; após callback do IdP, chamar completeAuthorization.
  // Em dev: página HTML com checkboxes de scopes.
  const html = `
<!doctype html>
<html lang="pt-br"><head><meta charset="utf-8"><title>Autorizar MCP</title></head>
<body style="font-family: system-ui; max-width: 480px; margin: 4rem auto;">
  <h1>Autorizar acesso</h1>
  <p>Cliente: <code>${oauthReq.clientId}</code></p>
  <form method="post" action="/authorize/approve">
    <input type="hidden" name="state" value="${oauthReq.state ?? ""}">
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
  <p style="color:#888;font-size:0.9em;margin-top:2rem">
    ⚠️ Em produção, autenticação real será feita via Cloudflare Access (OIDC).
  </p>
</body></html>`;
  return c.html(html);
});

app.post("/authorize/approve", async (c) => {
  const form = await c.req.formData();
  const scopes = form.getAll("scope").map(String) as Scope[];

  // ⚠️ DEV ONLY: em produção, isto vem do IdP após autenticação real.
  const userId = "dev-user@local";
  const cfToken = (c.env as any).CLOUDFLARE_API_TOKEN ?? "DEV_NO_TOKEN";

  // Reconstrói a auth request a partir do state — em produção, persistir em KV
  const oauthReq = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReq,
    userId,
    metadata: { label: userId },
    scope: scopes,
    props: { sub: userId, email: userId, scopes, cfToken },
  });

  return c.redirect(redirectTo);
});

export default app;
