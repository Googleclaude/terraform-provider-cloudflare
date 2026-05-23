# Plano de resposta a incidente — agente fora de controle

## Kill switch (60s)
```bash
wrangler kv:key put --binding=OAUTH_KV "emergency_pause" "true" \
  --remote --namespace-id <OAUTH_KV_ID>
```
Todos os crons retornam imediatamente quando essa flag é `true`.

## Rollback (2 min)
```bash
cd apps/autonomous-agent && wrangler rollback
cd apps/mcp-server && wrangler rollback
```

## Investigação
1. `wrangler tail autonomous-agent --format pretty`
2. Audit log: `audit_log_recent` com limit alto
3. AI Gateway: revisar últimas chamadas no dashboard

## Pós-mortem
Documentar em `docs/runbooks/post-mortems/AAAAMMDD-titulo.md`.
