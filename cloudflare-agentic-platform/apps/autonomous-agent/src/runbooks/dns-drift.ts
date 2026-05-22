/**
 * Runbook: detecta drift entre o estado declarado em infra/dns-zone/*.yaml
 * e o estado real da zona Cloudflare. Se houver drift, abre um PR via
 * ops-mcp (tool github_open_pr) — NUNCA aplica automaticamente.
 *
 * Política: o agente só pode propor mudanças. Humano aprova no PR.
 */

import { opsMcpClient, cfMcpClient } from "../mcp-clients";

interface DeclaredRecord {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
}

interface LiveRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
}

export interface DriftResult {
  drifted: boolean;
  details: string;
  missing: DeclaredRecord[];
  unexpected: LiveRecord[];
  pr_url?: string;
}

export function diffRecords(declared: DeclaredRecord[], live: LiveRecord[]) {
  const key = (r: { type: string; name: string; content: string }) =>
    `${r.type}|${r.name}|${r.content}`;
  const declaredKeys = new Set(declared.map(key));
  const liveKeys = new Set(live.map(key));

  const missing = declared.filter((r) => !liveKeys.has(key(r)));
  const unexpected = live.filter(
    (r) => !declaredKeys.has(key(r)) && r.type !== "NS" && r.type !== "SOA"
  );

  return { missing, unexpected };
}

/**
 * v1: hardcoded para alinhar com infra/dns-zone/example.yaml.
 * Produção: bundlar os YAML como assets do worker e parsear na inicialização.
 */
function loadDeclaredState(): DeclaredRecord[] {
  return [
    { type: "A",     name: "@",     content: "203.0.113.10", ttl: 300, proxied: true },
    { type: "A",     name: "www",   content: "203.0.113.10", ttl: 300, proxied: true },
    { type: "CNAME", name: "mcp",   content: "mcp-server.workers.dev", ttl: 300, proxied: true },
    { type: "CNAME", name: "agent", content: "autonomous-agent.workers.dev", ttl: 300, proxied: true },
  ];
}

export async function detectDnsDrift(env: Env): Promise<DriftResult> {
  if (!env.DNS_ZONE_ID || env.DNS_ZONE_ID.startsWith("TODO_")) {
    return {
      drifted: false,
      details: "DNS_ZONE_ID não configurado — runbook em standby",
      missing: [],
      unexpected: [],
    };
  }

  const declared = loadDeclaredState();
  const cfMcp = cfMcpClient(env);
  const response = (await cfMcp.callTool("dns_list_records", {
    zone_id: env.DNS_ZONE_ID,
    per_page: 100,
  })) as { result?: { content?: Array<{ text?: string }> } };

  const payloadText = response.result?.content?.[0]?.text ?? "{}";
  const live: LiveRecord[] = (() => {
    try {
      const parsed = JSON.parse(payloadText) as { result?: LiveRecord[] };
      return parsed.result ?? [];
    } catch {
      return [];
    }
  })();

  const { missing, unexpected } = diffRecords(declared, live);
  const drifted = missing.length > 0 || unexpected.length > 0;

  if (!drifted) {
    return {
      drifted: false,
      details: `OK — ${live.length} registros conferem com o declarado`,
      missing: [],
      unexpected: [],
    };
  }

  const summary =
    `Drift detectado em ${env.DNS_ZONE_ID}:\n` +
    `- ${missing.length} faltando (declarado mas ausente)\n` +
    `- ${unexpected.length} inesperados (presente mas não declarado)`;

  if (
    env.GITHUB_OWNER &&
    env.GITHUB_REPO &&
    !env.GITHUB_OWNER.startsWith("TODO_") &&
    !env.GITHUB_REPO.startsWith("TODO_")
  ) {
    const date = new Date().toISOString().slice(0, 10);
    const opsMcp = opsMcpClient(env);
    const prResult = (await opsMcp.callTool("github_open_pr", {
      owner: env.GITHUB_OWNER,
      repo: env.GITHUB_REPO,
      branch: `agent/dns-drift-${date}`,
      title: `chore(dns): drift detectado em ${env.DNS_ZONE_ID}`,
      body:
        `Drift detectado pelo runbook \`dns-drift\` em ${new Date().toISOString()}.\n\n` +
        `## Faltando (no YAML, ausente na zona)\n\n` +
        "```json\n" + JSON.stringify(missing, null, 2) + "\n```\n\n" +
        `## Inesperados (na zona, ausente no YAML)\n\n` +
        "```json\n" + JSON.stringify(unexpected, null, 2) + "\n```\n\n" +
        `Revise: ou ajuste o YAML para refletir a realidade, ou aprove esse PR para que a próxima execução do agente reaplique o YAML.`,
      files: [
        {
          path: `infra/dns-zone/drift-${date}.json`,
          content: JSON.stringify({ missing, unexpected }, null, 2),
        },
      ],
      draft: true,
    })) as { result?: { content?: Array<{ text?: string }> } };
    const prText = prResult.result?.content?.[0]?.text ?? "";
    const match = prText.match(/https:\/\/github\.com\/[^\s]+/);
    return {
      drifted: true,
      details: summary,
      missing,
      unexpected,
      ...(match ? { pr_url: match[0] } : {}),
    };
  }

  return { drifted: true, details: summary, missing, unexpected };
}
