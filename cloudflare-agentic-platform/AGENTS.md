# AGENTS.md

> Este arquivo é lido automaticamente por Claude Code, OpenCode, Cursor e outros agentes
> de coding. Mantenha-o atualizado conforme o projeto evolui.

## Sobre o projeto

Plataforma agêntica sobre o edge da Cloudflare. Componentes principais:

- **`apps/mcp-server`** — MCP Server próprio (McpAgent), expõe tools curadas para operação da rede
- **`apps/autonomous-agent`** — Agente autônomo com cron triggers e runbooks
- **`skills/cloudflare-ops`** — Agent Skill distribuível (padrão Skills)
- **`packages/*`** — código compartilhado (tipos, SDK tipado, eval suite)
- **`infra/*`** — infra-as-code (DNS, WAF, Access policies)

Plano completo em `docs/projeto.md`.

## Stack

- **Runtime:** Cloudflare Workers (V8 isolates) + Durable Objects (SQLite)
- **Linguagem:** TypeScript estrito (`"strict": true`, sem `any` implícito)
- **Package manager:** `pnpm` workspaces (monorepo)
- **MCP:** `agents` (Cloudflare Agents SDK) + `@modelcontextprotocol/sdk`
- **Auth:** `@cloudflare/workers-oauth-provider` + Cloudflare Access
- **Storage:** R2 (artifacts), D1 (audit log), KV (OAuth state), Vectorize (memória)
- **Deploy:** `wrangler` via GitHub Actions com OIDC

## Convenções

### Estilo de código
- TypeScript estrito; sem `any` exceto em fronteiras explicitamente comentadas
- Schemas de input/output sempre com `zod`
- Imports absolutos via paths do `tsconfig.json`
- Nada de `console.log` em produção — usar `console.info/warn/error` estruturado

### Tools do MCP
- **Few, well-designed:** preferir 10 tools de alto nível do que 200 wrappers
- **Idempotência por padrão:** toda tool aceita re-execução
- **Descrições ricas:** o agente decide pela descrição — incluir exemplos, constraints, side-effects
- **HITL obrigatório** para operações destrutivas (`delete_*`, `disable_*`, `rotate_*`)
- Toda tool registra no audit log via `audit_log_record` antes de retornar

### Commits e PRs
- Conventional Commits: `feat(mcp):`, `fix(agent):`, `chore(infra):`
- PR pequeno e focado; nunca misturar refactor com feature
- CI obrigatório: `pnpm test`, `pnpm eval`, `pnpm typecheck`, `pnpm lint`

### Segurança — não negociável
- **NUNCA** commitar tokens, secrets, ou API keys (mesmo de exemplo)
- **NUNCA** criar um "god token" da Cloudflare; sempre downscoped por sessão OAuth
- **NUNCA** desabilitar HITL em tools destrutivas
- **NUNCA** rodar `wrangler deploy` direto em main; só via Actions

## Comandos úteis

```bash
# Setup inicial
pnpm install
pnpm typecheck

# Dev local
pnpm --filter mcp-server dev          # http://localhost:8788
pnpm --filter autonomous-agent dev

# Testes e evals
pnpm test                              # unit tests
pnpm eval                              # avaliação das tools do MCP
pnpm --filter mcp-server eval:tools    # eval só das tools

# Deploy (normalmente só CI faz)
pnpm --filter mcp-server deploy

# Migrations D1
pnpm --filter autonomous-agent d1:migrate

# Logs
wrangler tail mcp-server --format pretty
```

## Estado atual da implementação

> Atualizar à medida que cada fase fechar.

- [x] Fase 0 — Bootstrap (monorepo, pnpm workspaces, tsconfig)
- [ ] Fase 1 — Edge security baseline (depende da conta Cloudflare)
- [ ] Fase 2 — Storage (R2/D1/KV/Vectorize) — schemas prontos; criar recursos via wrangler
- [x] Fase 3 — MCP Server v1 (OAuth, tools DNS/WAF/Access/Observability/Github/Emergency, audit log, HITL)
- [x] Fase 4 — Agente autônomo (3 cron triggers, health-check, dns-drift)
- [x] Fase 5 — Code Mode + MCP oficial Cloudflare (clients prontos, dns-drift implementado)
- [x] Fase 6 — Skill distribuível (skills/cloudflare-ops com 3 slash commands)
- [ ] Fase 7 — Rede privada (VPC/Mesh/Tunnel) — depende de túnel real
- [ ] Fase 8 — AI Gateway — depende da conta Cloudflare
- [x] Fase 9 — CI/CD completo (deploy-mcp, deploy-agent, pr-checks, dependabot)
- [x] Fase 10 — Hardening: kill switch (emergency_pause), rotate-secrets.ts, runbook docs, incident-response.md

### Pendências para go-live (humano)
Veja checklist em `PROMPTS.md` ("Pós-execução — Checklist humano").

## Como pedir ajuda ao agente

Ao iniciar uma tarefa, sempre:
1. Ler `docs/projeto.md` (plano mestre)
2. Verificar a fase atual em "Estado atual"
3. Checar `infra/` para o estado declarado dos recursos
4. Rodar `pnpm typecheck` antes de propor mudanças
5. Para qualquer mudança em produção, abrir PR — nunca aplicar direto

## Recursos externos canônicos

- Plano completo: `docs/projeto.md`
- Cloudflare Agents docs: https://developers.cloudflare.com/agents/
- Code Mode: https://blog.cloudflare.com/code-mode-mcp/
- Workers OAuth Provider: https://github.com/cloudflare/workers-oauth-provider

## O que NÃO fazer

- Não criar um Worker monolítico que faz tudo — separação por app é proposital
- Não substituir Durable Objects por Redis externo — perde-se o modelo de consistência
- Não expor a API Cloudflare diretamente como tools — usar Code Mode no MCP oficial
- Não pular evals em PR — tools sem eval não vão para produção
