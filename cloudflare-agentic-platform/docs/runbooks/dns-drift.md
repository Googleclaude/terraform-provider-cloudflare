# Runbook: dns-drift

**Trigger:** cron `0 * * * *` (hora cheia)
**Tool:** `detectDnsDrift()` em `apps/autonomous-agent/src/runbooks/dns-drift.ts`

## O que faz
1. Carrega estado declarado de `infra/dns-zone/*.yaml`
2. Lista registros reais via MCP oficial Cloudflare
3. Compara
4. Se houver drift, abre PR em `infra/dns-zone/` com o diff

## Política
- NUNCA aplica mudanças automaticamente — só abre PR
- Drift é resolvido por humano: ou aprova a mudança no PR, ou corrige a infra
