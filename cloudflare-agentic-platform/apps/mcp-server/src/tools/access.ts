import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

const CF_API = "https://api.cloudflare.com/client/v4";

export function registerAccessTools(server: McpServer, props: Props, env: Env) {
  server.tool(
    "access_list_applications",
    "Lista as aplicações Access da conta.",
    { account_id: z.string() },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "access_list_applications", args, async () => {
        const res = await fetch(`${CF_API}/accounts/${args.account_id}/access/apps`, {
          headers: { Authorization: `Bearer ${props.cfToken}` },
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );
}
