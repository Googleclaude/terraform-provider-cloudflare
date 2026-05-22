# Cloudflare Agentic Platform

Plataforma agêntica sobre o edge da Cloudflare. Veja:

- [`docs/projeto.md`](./docs/projeto.md) — plano completo
- [`AGENTS.md`](./AGENTS.md) — contexto para Claude Code e outros agentes de coding
- [`PROMPTS.md`](./PROMPTS.md) — sequência de prompts para execução assistida

## Quickstart

```bash
pnpm install
pnpm typecheck
pnpm test
```

## Apps

- `apps/mcp-server` — MCP Server próprio (McpAgent) com tools DNS, WAF, Access, Observability, GitHub e Emergency
- `apps/autonomous-agent` — Agente autônomo com cron + runbooks (health-check, dns-drift)

## Operações

### Kill switch (em incidente)
```bash
# Via MCP (preferido, audita)
mcp call emergency_pause '{"reason":"...","approved":true}'

# Via wrangler (emergência)
wrangler kv:key put --binding=OAUTH_KV "emergency_pause" \
  '{"paused":true,"reason":"manual"}' --remote
```

Detalhes em [`docs/runbooks/emergency-pause.md`](./docs/runbooks/emergency-pause.md).

### Rotação de secrets
```bash
pnpm tsx scripts/rotate-secrets.ts --worker mcp-server --secret CLOUDFLARE_API_TOKEN
pnpm tsx scripts/rotate-secrets.ts --worker autonomous-agent --secret MCP_OPS_TOKEN
```

## CI/CD

Secrets necessários no repositório GitHub:
- `CF_API_TOKEN` — token Cloudflare scoped (Workers:Edit, DNS:Edit, Access:Edit)
- `CF_ACCOUNT_ID` — account ID Cloudflare
- `GITHUB_TOKEN` — automaticamente provisionado pelo Actions

Workflows:
- `.github/workflows/deploy-mcp.yml` — deploy do mcp-server em push para main
- `.github/workflows/deploy-agent.yml` — deploy do autonomous-agent em push para main
- `.github/workflows/pr-checks.yml` — typecheck + test em PRs

## Estado atual

Veja a seção "Estado atual da implementação" em [`AGENTS.md`](./AGENTS.md).
