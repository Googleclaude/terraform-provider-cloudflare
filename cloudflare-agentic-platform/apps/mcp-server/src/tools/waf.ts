import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

const CF_API = "https://api.cloudflare.com/client/v4";

export function registerWafTools(server: McpServer, props: Props, env: Env) {
  server.tool(
    "waf_list_custom_rules",
    "Lista as custom rules do WAF de uma zona.",
    { zone_id: z.string() },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "waf_list_custom_rules", args, async () => {
        const res = await fetch(
          `${CF_API}/zones/${args.zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint`,
          { headers: { Authorization: `Bearer ${props.cfToken}` } }
        );
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );

  server.tool(
    "waf_set_security_level",
    "Define o nível de segurança da zona (off, essentially_off, low, medium, high, under_attack).",
    {
      zone_id: z.string(),
      level: z.enum(["off", "essentially_off", "low", "medium", "high", "under_attack"]),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "waf_set_security_level", args, async () => {
        const res = await fetch(`${CF_API}/zones/${args.zone_id}/settings/security_level`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${props.cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: args.level }),
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );
}
