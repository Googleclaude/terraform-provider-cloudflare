# Projeto de Implantação — Rede Cloudflare com Agente Autônomo e MCP Próprio

> **Versão:** 1.0
> **Stack alvo:** Cloudflare Workers + Durable Objects + Agents SDK + MCP + Cloudflare Access
> **Modelo de execução:** Phased rollout com GitOps (Wrangler + GitHub Actions)
> **Premissa:** zero servidor próprio fora do edge da Cloudflare (serverless-first)

---

## 1. Visão Geral e Objetivos

Implantar uma **plataforma de operação de rede e aplicações totalmente sobre o edge da Cloudflare**, controlada por um **agente autônomo** que executa tarefas de manutenção, segurança, observabilidade e provisionamento sem intervenção humana, usando um **MCP Server próprio** como camada de capacidades.

### Objetivos mensuráveis

| Objetivo | Métrica de sucesso |
|---|---|
| Zero infraestrutura fora do edge | 100% dos componentes em Workers / DO / R2 / D1 |
| Resposta autônoma a incidentes | MTTR < 5 min para eventos cobertos pelo runbook do agente |
| Custo de contexto do agente | < 2k tokens para descobrir + invocar qualquer capacidade (via Code Mode) |
| Deploy seguro | 100% das mudanças via PR + CI, com OAuth scoped por usuário |
| Observabilidade | 100% das chamadas LLM passando por AI Gateway com cache, retry e fallback |

---

## 2. Arquitetura de Referência

```
                        ┌──────────────────────────────────────────────┐
                        │                USUÁRIO / OPERADOR            │
                        │   (Claude Code, Cursor, Windsurf, IDE, CLI)  │
                        └─────────────────────┬────────────────────────┘
                                              │ MCP (streamable-http) + OAuth 2.1
                                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          CLOUDFLARE EDGE NETWORK                             │
│                                                                              │
│  ┌──────────────┐   ┌──────────────────┐   ┌────────────────────────────┐    │
│  │   DNS / WAF  │   │  Cloudflare      │   │   AI Gateway               │    │
│  │   Bot Mgmt   │   │  Access (SSO)    │   │  (cache/retry/fallback)    │    │
│  └──────┬───────┘   └────────┬─────────┘   └─────────────┬──────────────┘    │
│         │                    │                           │                   │
│         ▼                    ▼                           ▼                   │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │                   WORKERS RUNTIME (V8 isolates)                  │        │
│  │                                                                  │        │
│  │   ┌────────────────────┐    ┌──────────────────────────────┐     │        │
│  │   │  MCP Server        │    │  Agente Autônomo             │     │        │
│  │   │  (McpAgent)        │◄──►│  (McpAgent + schedule())     │     │        │
│  │   │  - tools           │    │  - cron / webhook / event    │     │        │
│  │   │  - resources       │    │  - state em DO + SQLite      │     │        │
│  │   │  - Code Mode       │    │  - HITL approval flow        │     │        │
│  │   └─────────┬──────────┘    └─────────────┬────────────────┘     │        │
│  │             │                             │                      │        │
│  └─────────────┼─────────────────────────────┼──────────────────────┘        │
│                ▼                             ▼                               │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │                     STATE & STORAGE                              │        │
│  │  Durable Objects (SQLite) │ R2 │ D1 │ KV │ Vectorize │ Queues    │        │
│  └──────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │              REDE PRIVADA (Workers VPC + Mesh + Tunnel)          │        │
│  │     Acesso scoped a DBs e APIs internas sem expor à Internet     │        │
│  └──────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                        ┌────────────────────────────────────────┐
                        │   APIs Cloudflare (2.500+ endpoints)   │
                        │   via MCP oficial em Code Mode         │
                        └────────────────────────────────────────┘
```

### Decisões arquiteturais (ADRs resumidos)

- **ADR-01 — Stateful agent em Durable Object:** sessão por usuário/instância para permitir conversas longas, schedule e memória persistente sem reconstruir estado.
- **ADR-02 — Code Mode sobre MCP "tool por endpoint":** evita estouro de contexto. Expor `search()` + `execute()` em vez de N tools.
- **ADR-03 — OAuth 2.1 com Workers OAuth Provider:** todo cliente MCP autentica via OAuth; tokens scoped por capacidade aprovada.
- **ADR-04 — Cloudflare Access como IdP central:** SSO unificado (Google/GitHub/SAML) em vez de IdP por aplicação.
- **ADR-05 — AI Gateway na frente de qualquer LLM:** observabilidade, custo, cache, retry e model fallback obrigatórios.
- **ADR-06 — GitOps via Wrangler + Actions:** nenhuma alteração manual em produção; tudo via PR.

---

## 3. Pré-requisitos

### Conta e tooling
- [ ] Conta Cloudflare em plano que suporte Workers Paid (necessário para Durable Objects + Cron Triggers + Smart Placement)
- [ ] Domínio configurado na Cloudflare (zona ativa)
- [ ] Cloudflare Access habilitado (Zero Trust dashboard)
- [ ] Node.js LTS + `pnpm` instalados localmente
- [ ] `wrangler` (CLI) autenticado: `npx wrangler login`
- [ ] Conta GitHub/GitLab para repositório monorepo
- [ ] API Token Cloudflare scoped (apenas para CI; nunca para humanos)

### Identidade
- [ ] IdP corporativo conectado ao Access (Google Workspace, Okta, Azure AD, ou GitHub)
- [ ] Grupos definidos: `agents-admin`, `agents-operator`, `agents-readonly`

### Naming convention
- Subdomínio MCP: `mcp.<seu-dominio>.com` → roteia para o Worker do MCP server
- Subdomínio Agent UI: `agent.<seu-dominio>.com`
- Subdomínio AI Gateway: `gateway.<seu-dominio>.com` (CNAME ou route)

---

## 4. Estrutura de Repositório (Monorepo)

```
cloudflare-agentic-platform/
├── apps/
│   ├── mcp-server/              # MCP server próprio (McpAgent)
│   │   ├── src/
│   │   │   ├── index.ts         # entrypoint Worker + OAuthProvider
│   │   │   ├── agent.ts         # classe McpAgent com tools
│   │   │   ├── tools/           # cada tool em seu arquivo
│   │   │   │   ├── dns.ts
│   │   │   │   ├── waf.ts
│   │   │   │   ├── access.ts
│   │   │   │   └── observability.ts
│   │   │   ├── auth/            # OAuth handlers
│   │   │   └── codemode/        # integração Code Mode (opcional)
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   │
│   ├── autonomous-agent/        # Agente que executa tarefas em background
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── agent.ts         # McpAgent + schedule()
│   │   │   ├── runbooks/        # playbooks por tipo de incidente
│   │   │   ├── triggers/        # cron, webhook, queue consumers
│   │   │   └── policies/        # HITL approval rules
│   │   ├── wrangler.jsonc
│   │   └── package.json
│   │
│   └── dashboard/               # (opcional) UI Pages para operadores
│       └── ...
│
├── packages/
│   ├── shared-types/            # Zod schemas compartilhados
│   ├── cloudflare-sdk-typed/    # SDK tipado p/ Code Mode (gerado do OpenAPI)
│   └── eval-suite/              # testes de avaliação (evals) das tools
│
├── skills/                      # Agent Skill (padrão Skills)
│   └── cloudflare-ops/
│       ├── SKILL.md
│       ├── slash-commands/
│       └── examples/
│
├── infra/
│   ├── access-policies/         # políticas Access em JSON/Terraform
│   ├── waf-rules/               # custom rules como código
│   ├── dns-zone/                # registros DNS versionados
│   └── ai-gateway/              # configuração do gateway
│
├── .github/
│   └── workflows/
│       ├── deploy-mcp.yml
│       ├── deploy-agent.yml
│       ├── eval-tools.yml
│       └── plan-on-pr.yml
│
├── AGENTS.md                    # contexto para AI coding tools
├── README.md
└── package.json                 # workspaces pnpm
```

---

## 5. Fases de Implantação

### **Fase 0 — Bootstrap (Dia 1)**
Saída: monorepo criado, conta configurada, túneis de acesso prontos.

1. Criar repositório com a estrutura acima (`pnpm init` + workspaces)
2. `npx wrangler login` e validar com `wrangler whoami`
3. Adicionar zona DNS na Cloudflare; mover NS se ainda não estiver
4. Habilitar Cloudflare Access; conectar IdP; criar os 3 grupos
5. Criar API Token CI scoped: `Account.Workers Scripts:Edit`, `Zone.DNS:Edit`, `Access:Edit` — armazenar em GitHub Secrets

**Critério de aceite:** `wrangler deploy` funciona em um Worker hello-world no domínio.

---

### **Fase 1 — Edge Security Baseline (Dia 1–2)**
Saída: rede protegida antes de qualquer aplicação subir.

1. **WAF Managed Rules:** habilitar OWASP + Cloudflare Managed Ruleset
2. **Rate limiting:** regra global de 100 req/min/IP em `mcp.*` e `agent.*`
3. **Bot Management:** ativar (mesmo no plano Pro com Super Bot Fight Mode)
4. **TLS:** modo Full (Strict); HSTS com preload; min TLS 1.3
5. **Page Rules / Configuration Rules:** bloquear países fora da política, se aplicável
6. **DNSSEC:** habilitar na zona

Versionar tudo em `infra/waf-rules/` e `infra/dns-zone/` via Cloudflare Terraform Provider ou export JSON.

**Critério de aceite:** scan externo (e.g., Hardenize / SSL Labs) com nota A+.

---

### **Fase 2 — Compute & Storage Baseline (Dia 2–3)**
Saída: primitivas de armazenamento e fila criadas.

```bash
# R2 buckets
wrangler r2 bucket create agent-artifacts
wrangler r2 bucket create agent-runbooks

# D1 databases
wrangler d1 create agent-state
wrangler d1 create audit-log

# KV namespaces
wrangler kv namespace create OAUTH_KV
wrangler kv namespace create RATE_LIMIT_KV

# Queues (para processar eventos assíncronos)
wrangler queues create agent-events
wrangler queues create dlq-agent-events

# Vectorize (memória semântica do agente)
wrangler vectorize create agent-memory --dimensions=1024 --metric=cosine
```

Aplicar schema em D1 via migrations versionadas:

```sql
-- apps/autonomous-agent/migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,         -- user OAuth sub
  tool TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  output_hash TEXT NOT NULL,
  approved_by TEXT,            -- HITL approver
  status TEXT NOT NULL         -- success|failure|denied
);
CREATE INDEX idx_audit_ts ON audit_log(ts);
CREATE INDEX idx_audit_actor ON audit_log(actor);
```

---

### **Fase 3 — MCP Server Próprio (Semana 1)**
Saída: MCP server autenticado em produção em `mcp.<seu-dominio>.com`.

#### 3.1 Scaffold
```bash
cd apps/
pnpm create cloudflare@latest mcp-server \
  --template=cloudflare/ai/demos/remote-mcp-authless
```

Em seguida converter para autenticado (Workers OAuth Provider).

#### 3.2 Entrypoint (`apps/mcp-server/src/index.ts`)
```ts
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { OpsAgent } from "./agent";
import { authHandler } from "./auth";

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": OpsAgent.serve("/mcp"),
    "/sse": OpsAgent.serveSSE("/sse"), // legado
  },
  defaultHandler: authHandler,         // /authorize, /callback, /token
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

export { OpsAgent };
```

#### 3.3 Agent (`apps/mcp-server/src/agent.ts`)
```ts
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerDnsTools } from "./tools/dns";
import { registerWafTools } from "./tools/waf";
import { registerAccessTools } from "./tools/access";
import { registerObservabilityTools } from "./tools/observability";

type Props = {
  sub: string;        // OAuth subject (usuário)
  scopes: string[];   // capabilities aprovadas
  cfToken: string;    // token Cloudflare downscoped
};

export class OpsAgent extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: "cloudflare-ops",
    version: "1.0.0",
  });

  async init() {
    const { scopes } = this.props;

    if (scopes.includes("dns:write"))      registerDnsTools(this.server, this.props);
    if (scopes.includes("waf:write"))      registerWafTools(this.server, this.props);
    if (scopes.includes("access:write"))   registerAccessTools(this.server, this.props);
    if (scopes.includes("observability"))  registerObservabilityTools(this.server, this.props);
  }
}
```

#### 3.4 Exemplo de tool (`apps/mcp-server/src/tools/dns.ts`)
```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDnsTools(server: McpServer, props: Props) {
  server.tool(
    "dns_create_record",
    "Cria um registro DNS na zona indicada. Idempotente: se já existir com mesmo conteúdo, retorna o existente.",
    {
      zone_id: z.string().describe("Zone ID da Cloudflare"),
      type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX"]),
      name: z.string(),
      content: z.string(),
      ttl: z.number().int().min(60).max(86400).default(300),
      proxied: z.boolean().default(true),
    },
    async (args) => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${args.zone_id}/dns_records`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${props.cfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
        }
      );
      const json = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(json, null, 2) }] };
    }
  );
}
```

#### 3.5 `wrangler.jsonc`
```jsonc
{
  "name": "mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2026-04-01",
  "compatibility_flags": ["nodejs_compat"],
  "routes": [{ "pattern": "mcp.seu-dominio.com/*", "zone_name": "seu-dominio.com" }],

  "durable_objects": {
    "bindings": [{ "name": "MCP_AGENT", "class_name": "OpsAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["OpsAgent"] }],

  "kv_namespaces": [{ "binding": "OAUTH_KV", "id": "<id>" }],
  "d1_databases":  [{ "binding": "AUDIT", "database_name": "audit-log", "database_id": "<id>" }],

  "vars": {
    "ALLOWED_SCOPES": "dns:read,dns:write,waf:read,waf:write,access:read,access:write,observability"
  }
}
```

#### 3.6 Princípios de design das tools
- **Few, well-designed:** prefira 10 tools de alto nível ("rotacionar chave", "habilitar bypass de WAF temporário") do que 200 thin wrappers da API.
- **Idempotência por padrão:** toda tool aceita re-execução sem efeito colateral indesejado.
- **Descrições ricas:** o agente decide pela descrição. Inclua exemplos, constraints, side-effects.
- **HITL para destrutivo:** `delete_*`, `disable_*`, `rotate_*` exigem `elicitation` ou aprovação humana.

---

### **Fase 4 — Agente Autônomo (Semana 2)**
Saída: agent que roda em cron, recebe webhooks, executa runbooks, e aciona o MCP.

#### 4.1 Cron triggers
```jsonc
// apps/autonomous-agent/wrangler.jsonc (trecho)
"triggers": {
  "crons": [
    "*/5 * * * *",   // a cada 5min: health checks
    "0 * * * *",     // hora cheia: rotação de logs
    "0 3 * * *"      // 3h UTC: relatório diário
  ]
}
```

#### 4.2 Schedule programático
```ts
// dentro da classe Agent
export class AutonomousAgent extends McpAgent<Env, State> {
  async onCron(controller: ScheduledController) {
    // health-check
    const status = await this.runRunbook("health-check");
    if (status.severity >= "warn") {
      await this.schedule(60, "remediate", { incident: status.id });
    }
  }

  async remediate({ incident }: { incident: string }) {
    // chama o MCP server próprio via tool calling
    const plan = await this.planWith(this.env.AI, incident);
    if (plan.requiresApproval) {
      await this.notifySlack(plan);
      return;
    }
    await this.executePlan(plan);
  }
}
```

#### 4.3 Runbooks como código (`apps/autonomous-agent/src/runbooks/`)

Exemplos:
- `dns-drift-detection.ts` — compara estado declarado em `infra/dns-zone/` vs realidade; abre PR se houver drift
- `waf-attack-mitigation.ts` — se taxa de eventos WAF > limiar, escala regra para "block"
- `cert-rotation.ts` — rotaciona originais antes do vencimento
- `access-policy-review.ts` — semanalmente lista políticas e flagga as não usadas em 90d

#### 4.4 Human-in-the-loop (HITL)

Categorizar tools em:
- **Auto-aprovado:** read-only, idempotente, baixo blast radius
- **Aprovação assíncrona:** mudanças reversíveis (notifica via Slack/email; expira em 1h)
- **Aprovação síncrona:** destrutivo / segurança (exige confirmação no momento)

---

### **Fase 5 — Code Mode + MCP Oficial Cloudflare (Semana 2)**
Saída: agente acessa os 2.500+ endpoints da API Cloudflare gastando ~1k tokens.

Em vez de embutir 2.500 tools no seu MCP server, conecte o agente ao **MCP oficial da Cloudflare em Code Mode**:

```jsonc
// configuração MCP do agente
{
  "mcpServers": {
    "cloudflare-api": {
      "url": "https://api.mcp.cloudflare.com/mcp",
      "transport": "streamable-http"
    },
    "ops-mcp": {
      "url": "https://mcp.seu-dominio.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

O agente passa a ter:
- **Seu MCP** → operações de alto nível, com runbooks da sua organização
- **MCP oficial em Code Mode** → escape hatch para qualquer endpoint que você não envolveu ainda

---

### **Fase 6 — Skill da Cloudflare Ops (Semana 3)**
Saída: pacote de skill distribuível para Claude Code / OpenCode / Codex.

Estrutura mínima de `skills/cloudflare-ops/SKILL.md`:

```markdown
---
name: cloudflare-ops
description: Use sempre que o usuário pedir para diagnosticar, alterar ou
  provisionar recursos Cloudflare na nossa conta — DNS, WAF, Access, Workers,
  R2, AI Gateway, certs, túneis. Não use para perguntas conceituais sobre
  Cloudflare; só para operações reais na conta.
---

# Cloudflare Ops

## Quando usar
- Pedidos com verbos: criar, alterar, rotacionar, deletar, listar, auditar
- Menções a: DNS, WAF, Access, Workers, R2, túneis, certs

## Como usar
1. Sempre conecte ao MCP `ops-mcp` primeiro (operações curadas)
2. Se a operação não existir lá, use `cloudflare-api` em Code Mode
3. Antes de qualquer mudança destrutiva, mostre plano e peça confirmação
4. Após executar, registre no audit log via tool `audit_log_record`

## Slash commands disponíveis
- `/dns-add` — guia interativo para adicionar registro DNS
- `/waf-incident` — abre runbook de incidente WAF
- `/cert-rotate` — rotação de certificado de origem
```

Distribuir como plugin compatível com **Agent Skills standard**.

---

### **Fase 7 — Rede Privada (Workers VPC + Mesh + Tunnel) (Semana 3)**
Saída: agente acessa banco e APIs internos sem expor à Internet.

1. Criar **Cloudflare Tunnel** para datacenter/VPC on-prem: `cloudflared tunnel create ops-tunnel`
2. Configurar **Workers VPC** binding no `wrangler.jsonc`:
   ```jsonc
   "vpc_services": [
     { "binding": "INTERNAL_DB", "service_name": "postgres-prod" }
   ]
   ```
3. **Cloudflare Mesh** para grant scoped por agente (evita compartilhar credenciais de DB)
4. Política Access aplicada em cada tunnel hostname

---

### **Fase 8 — AI Gateway & Observabilidade (Semana 3–4)**
Saída: 100% das chamadas LLM observáveis e otimizadas.

```ts
// no agente, em vez de chamar OpenAI/Anthropic direto
const url = `https://gateway.ai.cloudflare.com/v1/${ACCOUNT_ID}/ops/anthropic/v1/messages`;
```

Configurar no AI Gateway:
- Cache: 1h para prompts idênticos read-only
- Rate limit: por usuário OAuth sub
- Fallback: Anthropic → OpenAI → Workers AI (Llama 3.x)
- Logging: 30 dias com PII redaction
- Custos: alertas por threshold

Logpush adicional:
- Workers Trace Events → R2 (frio) + Datadog/Splunk (quente)
- Audit log do MCP → D1 + R2

---

### **Fase 9 — CI/CD e GitOps (Semana 4)**
Saída: nada vai para produção fora de PR.

`.github/workflows/deploy-mcp.yml`:
```yaml
name: Deploy MCP Server
on:
  push:
    branches: [main]
    paths: ['apps/mcp-server/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write   # OIDC para Cloudflare
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter mcp-server test
      - run: pnpm --filter mcp-server eval   # roda eval suite
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          workingDirectory: apps/mcp-server
          command: deploy
```

PR checks obrigatórios:
- `eval-tools.yml` — roda evals contra cada tool nova/modificada
- `plan-on-pr.yml` — comenta no PR o "diff" de Access policies / DNS / WAF

---

### **Fase 10 — Hardening & Go-Live (Semana 4–5)**
Saída: produção.

1. **Pen test** das superfícies expostas (`mcp.*`, `agent.*`)
2. **Tabletop exercise** dos runbooks: simular incidente, validar resposta autônoma
3. **Disaster recovery drill:** restaurar D1 + R2 do backup
4. **Secret rotation** automatizada via tool dedicada
5. **Documentação operacional** em `AGENTS.md` (para futuros agentes de coding)
6. **Rollback plan** documentado: cada deploy gera versão; rollback = `wrangler rollback`

---

## 6. Modelo de Segurança (resumo)

| Camada | Controle |
|---|---|
| Identidade | Cloudflare Access + IdP corporativo (SSO) |
| Autorização | OAuth 2.1 com scopes por capability (`dns:write`, `waf:read`, ...) |
| Tokens CF | Downscoped por sessão via Workers OAuth Provider; nunca um "god token" |
| Tools destrutivas | HITL obrigatório; aprovação registrada em audit log |
| Rede | Workers VPC + Mesh para acesso interno; Tunnel sem porta exposta |
| Dados | R2 com object-lock para audit log; D1 com backup diário |
| Supply chain | `pnpm` com lockfile, dependabot, SBOM gerado no CI |
| Runtime | V8 isolates (sandbox); Code Mode roda em Dynamic Worker isolado |

---

## 7. Cronograma Resumido

| Semana | Entregáveis |
|---|---|
| **Semana 1** | Fases 0–3: bootstrap, edge security, storage, MCP server v1 em produção |
| **Semana 2** | Fases 4–5: agente autônomo com 3 runbooks, integração com MCP oficial Cloudflare |
| **Semana 3** | Fases 6–8: skill distribuível, rede privada via Tunnel/VPC, AI Gateway |
| **Semana 4** | Fase 9: CI/CD completo, evals, plan-on-PR |
| **Semana 5** | Fase 10: hardening, pen test, tabletop, go-live |

Equipe sugerida: **1 platform eng + 1 SRE + 1 sec eng (part-time)**. Solo é viável em 8–10 semanas.

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Agente executa ação destrutiva equivocada | Média | Alto | HITL obrigatório + scopes restritos + dry-run mode default |
| Token CF vazado | Baixa | Crítico | Tokens downscoped por sessão, TTL curto, rotação automática |
| Estouro de contexto do MCP | Média | Médio | Code Mode + tools de alto nível (não wrappers) |
| Custos LLM descontrolados | Média | Médio | AI Gateway com cap por usuário e cache agressivo |
| Drift entre infra-as-code e realidade | Alta | Médio | Runbook diário de drift detection abre PR automaticamente |
| Lock-in Cloudflare | Alta | Baixo | MCP é padrão aberto; lógica de negócio em TS portável |

---

## 9. Próximos Passos Imediatos

1. ✅ Validar este plano com stakeholders e ajustar escopo
2. ⬜ Criar repositório monorepo a partir desta estrutura
3. ⬜ Executar Fase 0 e 1 (1 dia)
4. ⬜ Decidir lista inicial de 5–8 runbooks prioritários
5. ⬜ Escolher 3 tools de alto nível para o MVP do MCP server

---

## 10. Referências

- Cloudflare Agents docs — https://developers.cloudflare.com/agents/
- Code Mode (blog) — https://blog.cloudflare.com/code-mode-mcp/
- Build a Remote MCP server — https://developers.cloudflare.com/agents/guides/remote-mcp-server/
- McpAgent API — https://developers.cloudflare.com/agents/model-context-protocol/mcp-agent-api/
- Cloudflare Skills — https://github.com/cloudflare/skills
- Workers OAuth Provider — https://github.com/cloudflare/workers-oauth-provider

---

*Documento vivo — versionar junto com o monorepo em `/docs/projeto.md`.*
