import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

export const KILL_SWITCH_KEY = "emergency_pause";

export function registerEmergencyTools(server: McpServer, props: Props, env: Env) {
  server.tool(
    "emergency_pause",
    "Aciona o kill switch: agentes autônomos param de executar runbooks no próximo tick de cron. Reversível via emergency_resume. Use SOMENTE em incidente. Requer aprovação humana (approved: true).",
    {
      reason: z.string().min(8).describe("Motivo (auditado)"),
      approved: z.boolean().default(false),
    },
    async (args) => {
      if (!args.approved) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `⚠️  Pause emergencial — confirmação obrigatória.\n` +
                `Motivo: ${args.reason}\n` +
                `Reenvie com approved: true para acionar o kill switch.`,
            },
          ],
        };
      }
      return withAudit(
        env.AUDIT,
        props.sub,
        "emergency_pause",
        args,
        async () => {
          await env.OAUTH_KV.put(
            KILL_SWITCH_KEY,
            JSON.stringify({
              paused: true,
              by: props.sub,
              reason: args.reason,
              ts: Date.now(),
            })
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `🛑 Kill switch ATIVO. Crons do agente serão ignorados até emergency_resume.`,
              },
            ],
          };
        },
        { approvedBy: props.sub }
      );
    }
  );

  server.tool(
    "emergency_resume",
    "Remove o kill switch e retoma a execução dos runbooks autônomos.",
    {
      reason: z.string().min(4).describe("Motivo para retomar"),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "emergency_resume", args, async () => {
        await env.OAUTH_KV.delete(KILL_SWITCH_KEY);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Kill switch removido. Próximo cron tick voltará a executar.`,
            },
          ],
        };
      });
    }
  );

  server.tool(
    "emergency_status",
    "Retorna o estado do kill switch (paused/active).",
    {},
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "emergency_status", args, async () => {
        const raw = await env.OAUTH_KV.get(KILL_SWITCH_KEY);
        const state = raw ? JSON.parse(raw) : { paused: false };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(state, null, 2) },
          ],
        };
      });
    }
  );
}
