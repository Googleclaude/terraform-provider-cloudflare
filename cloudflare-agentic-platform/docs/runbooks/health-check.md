# Runbook: health-check

**Trigger:** cron `*/5 * * * *`
**Tool:** `runHealthCheck()` em `apps/autonomous-agent/src/runbooks/health-check.ts`

## O que faz
HEAD em cada host de `HOSTS_TO_CHECK`. Marca:
- `ok`: status 2xx/3xx e latência < 2s
- `warn`: status 2xx/3xx e latência >= 2s
- `crit`: erro, timeout ou status >= 400

## Ações automáticas
- `warn`: log estruturado + métrica no Logpush
- `crit`: dispara `remediate({incident})` no próprio agente

## Kill switch
`wrangler kv:key put --binding=OAUTH_KV "emergency_pause" "true"` → todos os crons retornam imediatamente.
