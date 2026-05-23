# Setup — do zero ao produção

Guia operacional para colocar a plataforma no ar. Cada passo tem tempo
estimado e o que precisa estar pronto antes.

> **Pré-requisito global:** uma conta Cloudflare em plano **Workers Paid**.

---

## 1. Login + conta (5 min)

```bash
npx wrangler login        # abre browser
npx wrangler whoami       # confirma conta + email
```

Anote o `Account ID` retornado — você vai precisar para os secrets do CI.

---

## 2. Zona DNS + Access (15 min, dashboard)

1. **DNS:** adicione a zona em `dash.cloudflare.com/<account>/<zone>` e
   altere os NS no registrar.
2. **Access:** vá em `one.dash.cloudflare.com` → Settings → Authentication.
   Conecte um IdP (Google Workspace / GitHub / Okta / SAML).
3. **Grupos:** crie em Access → Access Groups:
   - `agents-admin` — pode aprovar destrutivo
   - `agents-operator` — opera dia-a-dia
   - `agents-readonly` — só leitura

---

## 3. Provisionar recursos Cloudflare (2 min)

```bash
cd cloudflare-agentic-platform
./scripts/provision-cloudflare.sh           # cria KV + D1, imprime IDs
# ou tudo de uma vez:
./scripts/provision-cloudflare.sh --apply   # cria + aplica IDs em wrangler.jsonc + aplica migrations
```

O script é idempotente: re-execuções não duplicam recursos.

Se preferir manual:
```bash
cd apps/mcp-server
npx wrangler kv namespace create OAUTH_KV
npx wrangler d1 create audit-log
# substitua os TODO_REPLACE_WITH_* em wrangler.jsonc
npx wrangler d1 migrations apply audit-log --remote
```

---

## 4. Token Cloudflare (5 min)

Crie em `dash.cloudflare.com/profile/api-tokens` → Create Token → Custom.

**Scopes mínimos:**
- `Account → Workers Scripts → Edit`
- `Account → Workers KV Storage → Edit`
- `Account → D1 → Edit`
- `Zone → DNS → Edit` (na zona alvo)
- `Account → Access: Apps and Policies → Edit`

```bash
cd apps/mcp-server
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put GITHUB_TOKEN          # PAT classic com repo scope
```

**GitHub Actions** (Settings → Secrets):
- `CF_API_TOKEN` (mesmo do passo acima — use um token separado se quiser segregar)
- `CF_ACCOUNT_ID` (do `wrangler whoami`)

---

## 5. Configurar rotas + domínio (5 min)

Em `apps/mcp-server/wrangler.jsonc`, descomente e ajuste:

```jsonc
"routes": [{ "pattern": "mcp.seu-dominio.com/*", "zone_name": "seu-dominio.com" }],
```

Em `apps/autonomous-agent/wrangler.jsonc`, ajuste `vars.MCP_OPS_URL`,
`GITHUB_OWNER`, `GITHUB_REPO`, `DNS_ZONE_ID`, `HOSTS_TO_CHECK`.

---

## 6. Deploy (1 min)

Push para `main` → o workflow `deploy-mcp.yml` e `deploy-agent.yml`
fazem deploy automaticamente. Para deploy manual:

```bash
cd apps/mcp-server     && npx wrangler deploy
cd ../autonomous-agent && npx wrangler deploy
```

Validação:
```bash
curl https://mcp.seu-dominio.com/        # deve responder "Cloudflare Ops MCP Server"
curl https://mcp.seu-dominio.com/.well-known/oauth-authorization-server
```

---

## 7. Edge security baseline (30 min, dashboard)

Em `dash.cloudflare.com/<account>/<zone>`:

- **Security → WAF → Managed Rules:** habilitar `Cloudflare Managed Ruleset` + `OWASP Core Ruleset`
- **Security → WAF → Rate limiting rules:** criar rule global 100 req/min/IP em `mcp.*` e `agent.*`
- **Security → Bots:** ativar Super Bot Fight Mode (ou Bot Management se Enterprise)
- **SSL/TLS → Edge Certificates:** modo Full (Strict); HSTS preload; min TLS 1.3
- **DNS → Settings:** habilitar DNSSEC

Versionar tudo em `infra/waf-rules/` e `infra/dns-zone/` (export JSON ou Terraform).

---

## 8. Validar runbooks (10 min)

```bash
# health-check vai rodar em até 5min
npx wrangler tail autonomous-agent --format pretty

# Forçar uma execução:
npx wrangler dev    # depois fetch / cron via dashboard
```

Testar kill switch:
```bash
# Aciona
npx wrangler kv:key put --binding=OAUTH_KV "emergency_pause" \
  '{"paused":true,"by":"sre","reason":"teste","ts":'"$(date +%s)"'000}' \
  --remote --namespace-id <OAUTH_KV_ID>

# Próximo tick (até 5min) loga "cron */5 * * * * ignorado — kill switch ativo"

# Remove
npx wrangler kv:key delete --binding=OAUTH_KV "emergency_pause" \
  --remote --namespace-id <OAUTH_KV_ID>
```

---

## 9. Go-live checklist (humano)

- [ ] Pen test externo (`mcp.*`, `agent.*`)
- [ ] Tabletop com 2 cenários reais de incidente
- [ ] Validar rollback: `npx wrangler rollback`
- [ ] Confirmar kill switch funciona ponta-a-ponta
- [ ] Revisar políticas Access em produção
- [ ] Aprovação de segurança/compliance

---

## Troubleshooting

| Sintoma | Provável causa | Fix |
|---|---|---|
| `Authentication error [code: 10000]` | Token sem scope correto | Recriar token (passo 4) |
| `D1_ERROR: no such table: audit_log` | Migration não aplicada | `wrangler d1 migrations apply audit-log --remote` |
| `KV namespace not found` | `OAUTH_KV` id ainda em `TODO_` | Rodar passo 3 com `--apply` |
| OAuth redirect loop | Access não configurado | Voltar ao passo 2 |
| `cron ignorado — kill switch` | Flag de emergência ativa | Passo 8, "Remove" |

Mais runbooks em `docs/runbooks/`.
