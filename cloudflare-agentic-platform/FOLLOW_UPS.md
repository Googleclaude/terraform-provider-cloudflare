# Follow-ups

Roadmap de melhorias identificadas durante o code review do PR #2.
Cada item é um PR independente. Ordem é sugestão, não obrigatória.

---

## FU-1 — Tests para WAF/Access/DNS write tools

**Files:** `apps/mcp-server/test/{dns,waf,access}.spec.ts`
**Pattern:** mock `McpServer` + `vi.stubGlobal("fetch", ...)` — ver `test/github.spec.ts`

**Done when:**
- `dns_create_record` idempotency: pré-existente → retorna sem POST
- `delete_dns_record` sem `approved` → recusa, NÃO chama fetch
- `waf_set_security_level` audita
- `access_list_applications` chama endpoint correto

**Effort:** ~2h

---

## FU-2 — Eval suite (qualidade das tools)

**Files:** `packages/eval-suite/src/` + `apps/mcp-server/vitest.eval.config.ts` + `.github/workflows/eval-tools.yml`

**Done when:**
- 1 eval por write-tool com fixture de input e expected behavior
- Workflow roda em todo PR que toca `apps/mcp-server/src/tools/`
- Failing eval bloqueia merge

**Effort:** ~6h

---

## FU-3 — `cfMcpClient` com OAuth

**File:** `apps/autonomous-agent/src/mcp-clients.ts`

Hoje `cfMcpClient` chama `api.mcp.cloudflare.com/mcp` sem auth — só funciona pra tools públicas.

**Done when:**
- Flow OAuth completo usando Workers OAuth Provider client
- Token armazenado em KV com TTL
- Refresh automático

**Effort:** ~4h
**Bloqueia:** uso real de Code Mode contra API Cloudflare

---

## FU-4 — `loadDeclaredState` parseia YAML real

**File:** `apps/autonomous-agent/src/runbooks/dns-drift.ts`

Hoje é array hardcoded. Precisa parsear `infra/dns-zone/*.yaml`.

**Done when:**
- Wrangler asset binding bundla `infra/dns-zone/*.yaml`
- Função parseia (lib `yaml` ~17KB minified)
- Suporta múltiplas zonas (iterar por arquivo)
- Test cobrindo parse + erro de YAML malformado

**Effort:** ~3h

---

## FU-5 — Per-user/per-tool rate limiting

**Files:** `apps/mcp-server/src/middleware/rate-limit.ts` + integração em `agent.ts`

Cloudflare edge rate limiting cobre ataque DDoS, mas não rate-limit por usuário OAuth dentro do app.

**Done when:**
- KV-backed sliding window por `props.sub` × tool name
- 60 req/min/usuário (configurável via env var)
- Rate limit registrado em audit log com status `denied`
- Header `Retry-After` na resposta

**Effort:** ~4h

---

## FU-6 — CODEOWNERS reais

**File:** `.github/CODEOWNERS`

Hoje: `* @TODO-OWNER`. Substituir pelos handles reais antes do go-live.

**Effort:** 5min

---

## FU-7 — Path encoding em `github_open_pr`

**File:** `apps/mcp-server/src/tools/github.ts:89,96`

Hoje usa `encodeURI()`. Não codifica `?`, `#`, `&`. Em paths com esses caracteres, URL quebra.

**Fix:**
```ts
const encodedPath = f.path.split("/").map(encodeURIComponent).join("/");
```

**Effort:** 15min

---

## FU-8 — Documentar comportamento `diffRecords` com mudança de content

**File:** `docs/runbooks/dns-drift.md`

Uma mudança de content gera entrada em AMBOS `missing` e `unexpected`. Operador
revisando PR auto-gerado precisa entender isso.

**Effort:** 10min

---

## FU-9 — Search query escaping em `github_open_pr`

**File:** `apps/mcp-server/src/tools/github.ts:46`

Título do PR é interpolado na query de busca sem escapar `"`. GitHub trata
server-side mas a idempotência pode silenciosamente errar.

**Fix:** strip quotes ou usar GraphQL com variables.

**Effort:** 30min

---

## Quando criar

Filtre por **bloqueia produção** vs **nice-to-have**:

| Item | Bloqueia produção? |
|---|---|
| FU-1 | nice-to-have |
| FU-2 | nice-to-have (mas exigido por AGENTS.md "tools sem eval não vão para produção") |
| FU-3 | **sim** — se quiser usar Code Mode |
| FU-4 | **sim** — dns-drift hoje só funciona pra zona com registros hardcoded |
| FU-5 | **sim** — sem rate limit, qualquer usuário OAuth comprometido derruba quota |
| FU-6 | **sim** — review obrigatória |
| FU-7 | nice-to-have |
| FU-8 | nice-to-have |
| FU-9 | nice-to-have |

**Sugestão de sequência pré-prod:** FU-6 → FU-4 → FU-5 → FU-3 → resto.
