interface Env {
  AGENT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  MCP_OPS_URL: string;
  MCP_CF_URL: string;
  HOSTS_TO_CHECK: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  DNS_ZONE_ID: string;
  // Secret — wrangler secret put MCP_OPS_TOKEN
  MCP_OPS_TOKEN?: string;
}
