import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

export function registerObservabilityTools(server: McpServer, props: Props, env: Env) {
  server.tool(
    "audit_log_recent",
    "Retorna as últimas N entradas do audit log do MCP server.",
    {
      limit: z.number().int().min(1).max(500).default(50),
      actor: z.string().optional().describe("Filtra por OAuth sub"),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "audit_log_recent", args, async () => {
        const query = args.actor
          ? `SELECT * FROM audit_log WHERE actor = ?1 ORDER BY ts DESC LIMIT ?2`
          : `SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?1`;
        const stmt = args.actor
          ? env.AUDIT.prepare(query).bind(args.actor, args.limit)
          : env.AUDIT.prepare(query).bind(args.limit);
        const result = await stmt.all();
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      });
    }
  );
}
