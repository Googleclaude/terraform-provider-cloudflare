import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Props } from "../types";
import { withAudit } from "../audit";

const GH_API = "https://api.github.com";

export function registerGithubTools(server: McpServer, props: Props, env: Env) {
  server.tool(
    "github_open_pr",
    "Abre um pull request no repositório indicado. Cria um novo branch a partir do default branch, faz commit de um conjunto de arquivos (path → conteúdo UTF-8) e abre o PR. Idempotente por título: se já existir um PR aberto com o mesmo título no mesmo branch base, retorna o existente.",
    {
      owner: z.string().describe("GitHub owner/org (ex: my-org)"),
      repo: z.string().describe("Nome do repositório"),
      base: z.string().default("main").describe("Branch base (default main)"),
      branch: z.string().describe("Nome do branch novo (ex: agent/dns-drift-2026-05-21)"),
      title: z.string().max(255),
      body: z.string().describe("Descrição do PR em markdown"),
      files: z
        .array(
          z.object({
            path: z.string().describe("Caminho relativo do arquivo no repo"),
            content: z.string().describe("Conteúdo do arquivo em UTF-8"),
          })
        )
        .min(1),
      draft: z.boolean().default(true),
    },
    async (args) => {
      return withAudit(env.AUDIT, props.sub, "github_open_pr", args, async () => {
        const token = env.GITHUB_TOKEN;
        if (!token) {
          throw new Error(
            "GITHUB_TOKEN não configurado. Rode: wrangler secret put GITHUB_TOKEN"
          );
        }
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "cloudflare-ops-mcp",
        };

        // 1. Idempotência por título no branch base
        const search = new URLSearchParams({
          q: `is:pr is:open repo:${args.owner}/${args.repo} base:${args.base} in:title "${args.title}"`,
        });
        const existing = (await fetch(`${GH_API}/search/issues?${search}`, {
          headers,
        }).then((r) => r.json())) as { items?: Array<{ html_url: string; number: number }> };
        if (existing.items?.length) {
          const pr = existing.items[0]!;
          return {
            content: [
              {
                type: "text" as const,
                text: `PR já existente (idempotência): #${pr.number} → ${pr.html_url}`,
              },
            ],
          };
        }

        // 2. Resolver SHA do branch base
        const baseRef = (await fetch(
          `${GH_API}/repos/${args.owner}/${args.repo}/git/ref/heads/${args.base}`,
          { headers }
        ).then((r) => r.json())) as { object?: { sha: string } };
        if (!baseRef.object?.sha) {
          throw new Error(`branch base não encontrado: ${args.base}`);
        }
        const baseSha = baseRef.object.sha;

        // 3. Criar branch novo (se já existir, segue em frente)
        const createRef = await fetch(
          `${GH_API}/repos/${args.owner}/${args.repo}/git/refs`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ ref: `refs/heads/${args.branch}`, sha: baseSha }),
          }
        );
        if (!createRef.ok && createRef.status !== 422) {
          throw new Error(`falha ao criar branch ${args.branch}: ${await createRef.text()}`);
        }

        // 4. Commitar cada arquivo via Contents API (cria ou atualiza)
        for (const f of args.files) {
          const getRes = await fetch(
            `${GH_API}/repos/${args.owner}/${args.repo}/contents/${encodeURI(f.path)}?ref=${args.branch}`,
            { headers }
          );
          const existing = getRes.ok
            ? ((await getRes.json()) as { sha?: string })
            : { sha: undefined };
          const putRes = await fetch(
            `${GH_API}/repos/${args.owner}/${args.repo}/contents/${encodeURI(f.path)}`,
            {
              method: "PUT",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: `agent: update ${f.path}`,
                content: btoa(unescape(encodeURIComponent(f.content))),
                branch: args.branch,
                ...(existing.sha ? { sha: existing.sha } : {}),
              }),
            }
          );
          if (!putRes.ok) {
            throw new Error(`falha ao escrever ${f.path}: ${await putRes.text()}`);
          }
        }

        // 5. Abrir PR
        const prRes = await fetch(
          `${GH_API}/repos/${args.owner}/${args.repo}/pulls`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              title: args.title,
              body: args.body,
              head: args.branch,
              base: args.base,
              draft: args.draft,
            }),
          }
        );
        const pr = (await prRes.json()) as {
          html_url?: string;
          number?: number;
          message?: string;
        };
        if (!pr.html_url) {
          throw new Error(`falha ao abrir PR: ${pr.message ?? JSON.stringify(pr)}`);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `PR aberto: #${pr.number} → ${pr.html_url}`,
            },
          ],
        };
      });
    }
  );
}
