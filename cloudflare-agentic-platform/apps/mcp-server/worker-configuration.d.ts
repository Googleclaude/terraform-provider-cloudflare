interface Env {
  MCP_AGENT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  AUDIT: D1Database;
  ALLOWED_SCOPES: string;
  // Secret — wrangler secret put CLOUDFLARE_API_TOKEN
  CLOUDFLARE_API_TOKEN?: string;
  // Secret — wrangler secret put GITHUB_TOKEN
  GITHUB_TOKEN?: string;
  // OAuth provider injeta isto
  OAUTH_PROVIDER: any;
}
