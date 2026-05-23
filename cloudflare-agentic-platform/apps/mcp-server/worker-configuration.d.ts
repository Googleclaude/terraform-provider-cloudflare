interface Env {
  MCP_AGENT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  AUDIT: D1Database;
  ALLOWED_SCOPES: string;
  // "cloudflare-access" (prod) | "dev-insecure" (local apenas). Unset = 503 em /authorize.
  AUTH_MODE?: string;
  // Domínio do team Access (ex: yourorg.cloudflareaccess.com) — usado para JWKS e iss.
  CF_ACCESS_TEAM_DOMAIN?: string;
  // AUD tag da aplicação Access (encontrado em Zero Trust > Access > Applications).
  CF_ACCESS_AUD?: string;
  // Deve ser exatamente "yes-i-know-this-is-insecure" para destravar AUTH_MODE=dev-insecure.
  DEV_MODE_CONFIRM?: string;
  // Secret — wrangler secret put CLOUDFLARE_API_TOKEN
  CLOUDFLARE_API_TOKEN?: string;
  // Secret — wrangler secret put GITHUB_TOKEN
  GITHUB_TOKEN?: string;
  // OAuth provider injeta isto
  OAUTH_PROVIDER: any;
}
