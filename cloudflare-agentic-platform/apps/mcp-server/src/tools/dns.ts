import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

const CF_API = "https://api.cloudflare.com/client/v4";

export function registerDnsTools(server: McpServer, props: Props, env: Env) {
  // READ: listar registros
  server.tool(
    "dns_list_records",
    "Lista registros DNS de uma zona. Retorna até 100 registros, paginados via cursor.",
    {
      zone_id: z.string().describe("Zone ID da Cloudflare"),
      type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS"]).optional(),
      name: z.string().optional().describe("Filtro por nome (full ou prefixo)"),
      page: z.number().int().min(1).default(1),
      per_page: z.number().int().min(1).max(100).default(50),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "dns_list_records", args, async () => {
        const params = new URLSearchParams();
        if (args.type) params.set("type", args.type);
        if (args.name) params.set("name", args.name);
        params.set("page", String(args.page));
        params.set("per_page", String(args.per_page));

        const res = await fetch(`${CF_API}/zones/${args.zone_id}/dns_records?${params}`, {
          headers: { Authorization: `Bearer ${props.cfToken}` },
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );

  // WRITE: criar registro (idempotente — checa se já existe)
  server.tool(
    "dns_create_record",
    "Cria um registro DNS na zona. Idempotente: se já existir com mesmo conteúdo, retorna o existente em vez de criar duplicata.",
    {
      zone_id: z.string(),
      type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX"]),
      name: z.string(),
      content: z.string(),
      ttl: z.number().int().min(60).max(86400).default(300),
      proxied: z.boolean().default(true),
      comment: z.string().max(100).optional(),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "dns_create_record", args, async () => {
        // Idempotência: verificar se já existe
        const params = new URLSearchParams({ type: args.type, name: args.name, content: args.content });
        const existing = await fetch(`${CF_API}/zones/${args.zone_id}/dns_records?${params}`, {
          headers: { Authorization: `Bearer ${props.cfToken}` },
        }).then((r) => r.json() as Promise<{ result: unknown[] }>);

        if (existing.result?.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Registro já existente (idempotência):\n${JSON.stringify(existing.result[0], null, 2)}`,
              },
            ],
          };
        }

        const res = await fetch(`${CF_API}/zones/${args.zone_id}/dns_records`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${props.cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );

  // WRITE: atualizar registro
  server.tool(
    "dns_update_record",
    "Atualiza um registro DNS existente. Recebe o ID do registro.",
    {
      zone_id: z.string(),
      record_id: z.string(),
      type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX"]).optional(),
      name: z.string().optional(),
      content: z.string().optional(),
      ttl: z.number().int().min(60).max(86400).optional(),
      proxied: z.boolean().optional(),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "dns_update_record", args, async () => {
        const { zone_id, record_id, ...patch } = args;
        const res = await fetch(`${CF_API}/zones/${zone_id}/dns_records/${record_id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${props.cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      });
    }
  );

  // DESTRUCTIVE: delete (HITL será aplicado pelo wrapper no agent.ts)
  server.tool(
    "delete_dns_record",
    "Remove um registro DNS. DESTRUTIVA — requer aprovação humana (HITL).",
    {
      zone_id: z.string(),
      record_id: z.string(),
      approved: z.boolean().default(false).describe("Confirmação humana — passe true após revisar"),
    },
    async (args) => {
      if (!args.approved) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                `⚠️  Operação destrutiva. Para confirmar, reenvie com approved: true.\n` +
                `Zone: ${args.zone_id}\nRecord ID: ${args.record_id}`,
            },
          ],
        };
      }
      return withAudit(env.AUDIT, props.sub, "delete_dns_record", args, async () => {
        const res = await fetch(`${CF_API}/zones/${args.zone_id}/dns_records/${args.record_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${props.cfToken}` },
        });
        const json = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(json, null, 2) }] };
      }, { approvedBy: props.sub });
    }
  );
}
