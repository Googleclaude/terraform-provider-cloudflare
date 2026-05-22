# Runbook: emergency-pause (kill switch)

**Tool:** `emergency_pause` no MCP server
**Storage:** key `emergency_pause` em KV (binding `OAUTH_KV`)
**Verificação:** `apps/autonomous-agent/src/triggers/cron.ts → isPaused()`

## O que faz

Define uma flag em KV. O dispatcher de cron do agente autônomo lê essa
flag antes de cada execução de runbook. Se `paused: true`, todos os
crons retornam imediatamente sem efeito.

## Quando usar

- Suspeita de runbook em loop ou abrindo PRs em excesso
- Drift detectado em massa (provável bug, não realidade)
- Custos LLM acima do threshold (notificação do AI Gateway)
- Qualquer comportamento inesperado

## Como acionar

### Via MCP (preferido — registra no audit log)
```
emergency_pause
  reason: "PR storm — investigar drift detector"
  approved: true
```

### Via Wrangler (em emergência, sem MCP)
```bash
wrangler kv:key put --binding=OAUTH_KV "emergency_pause" \
  '{"paused":true,"by":"sre@org","reason":"manual","ts":1700000000}' \
  --remote --namespace-id <OAUTH_KV_ID>
```

## Como retomar

### Via MCP
```
emergency_resume
  reason: "bug fix deployed em PR #123"
```

### Via Wrangler
```bash
wrangler kv:key delete --binding=OAUTH_KV "emergency_pause" \
  --remote --namespace-id <OAUTH_KV_ID>
```

## Verificar estado

```
emergency_status
```

Retorna `{ paused: false }` ou `{ paused: true, by, reason, ts }`.
