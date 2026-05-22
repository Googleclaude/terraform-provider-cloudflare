import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDnsTools } from "./tools/dns";
import { registerWafTools } from "./tools/waf";
import { registerAccessTools } from "./tools/access";
import { registerObservabilityTools } from "./tools/observability";
import { registerGithubTools } from "./tools/github";
import { registerEmergencyTools } from "./tools/emergency";
import type { Props, Scope } from "./types";

export class OpsAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: "cloudflare-ops",
    version: "1.0.0",
  });

  async init() {
    const scopes = new Set<Scope>(this.props.scopes);

    if (scopes.has("dns:read") || scopes.has("dns:write")) {
      registerDnsTools(this.server, this.props, this.env);
    }
    if (scopes.has("waf:read") || scopes.has("waf:write")) {
      registerWafTools(this.server, this.props, this.env);
    }
    if (scopes.has("access:read") || scopes.has("access:write")) {
      registerAccessTools(this.server, this.props, this.env);
    }
    if (scopes.has("observability")) {
      registerObservabilityTools(this.server, this.props, this.env);
    }
    if (scopes.has("github:write")) {
      registerGithubTools(this.server, this.props, this.env);
    }
    if (scopes.has("emergency:write")) {
      registerEmergencyTools(this.server, this.props, this.env);
    }
  }
}
