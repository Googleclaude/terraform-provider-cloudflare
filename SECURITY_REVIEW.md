# Relatório Final de Revisão — terraform-provider-cloudflare

**Data:** 2026-05-24
**Branch:** `claude/loving-hamilton-T8Fm8`
**Base:** `main` @ `b2277b8b` (release 5.19.1)
**Escopo:** Auditoria de segurança (gosec, scan de segredos no histórico, revisão manual), conformidade LGPD e refatoração Phase 5/6 — restrita ao código **não autogerado** (`internal/{acctest,customfield,customvalidator,migrations,logging,utils,apijson,apijsoncustom,apiform,importpath,schemata,types,tools,test_helpers}` + `provider.go` + `cmd/`).

---

## 1. Sumário Executivo

O provider Cloudflare é uma ferramenta de Infrastructure-as-Code que se comunica com a API Cloudflare via HTTPS; a maioria do código é gerada por Stainless a partir de OpenAPI e está fora do escopo de refatoração. Não foram encontrados segredos no histórico do git nem vulnerabilidades em código de runtime — todos os 11 alertas do gosec estão em código de teste/desenvolvimento e são padrões aceitáveis com o devido contexto. Conformidade LGPD: o provider é majoritariamente **Não Aplicável** ou **Conforme** (não trata dados de titulares brasileiros), com pontos de melhoria documental e de redação no logging em nível DEBUG. A oportunidade técnica mais alta é colapsar a duplicação entre `apijson`/`apijsoncustom` (~2 000 LOC de risco de drift). Três correções de baixo risco foram aplicadas nesta branch; o restante fica como propostas faseadas.

---

## 2. Matriz de Achados

| # | Severidade | Trilha | Origem | Item | Arquivo:linha | Status |
|---|---|---|---|---|---|---|
| F-01 | INFO | Security | git log scan | Sem segredos no histórico do repo público | (todo histórico) | OK |
| F-02 | LOW | Security | gosec G404 | `math/rand` para nome de teste | `internal/utils/random_acc_test_name.go:41,52` | Aceito (não-cripto) |
| F-03 | LOW | Security | gosec G703 | Path traversal em ferramenta dev | `internal/tools/sweeper-lint/main.go:30` | Aceito (CLI dev) |
| F-04 | LOW | Security | gosec G204 | Subprocess com variável | `internal/acctest/acctest.go:1155,1219-1224` | Aceito (test runner) |
| F-05 | LOW | Security | gosec G304 | Inclusão de arquivo via variável | `internal/acctest/acctest.go:382,1209,1234,1435` | Aceito (paths em tmpDir) |
| F-06 | MEDIUM | Security | gosec G306 | WriteFile 0644 em config de teste | `internal/acctest/acctest.go:1084,1110` | **Aplicado nesta branch** (0600) |
| F-07 | MEDIUM | Security | Revisão manual | Logging do corpo de request/response em DEBUG sem redação de campos JSON sensíveis | `internal/logging/logging.go:64,93` | Pendente — proposta abaixo |
| F-08 | LOW | Security | Revisão manual | Comentário "response" no fluxo do request | `internal/logging/logging.go:60-62` | **Aplicado nesta branch** |
| F-09 | LOW | Quality | Revisão manual | Comentário de default desatualizado `(default: false)` quando é `true` | `cmd/migrate/main.go:27` | **Aplicado nesta branch** |
| F-10 | INFO | Privacy/LGPD | Agente LGPD | Sem `PRIVACY.md` / nota de transferência internacional em `docs/index.md` | docs | Proposta documental |
| F-11 | INFO | Privacy/LGPD | Agente LGPD | `SECURITY.md` minimalista — sem menção a LGPD/ANPD | `SECURITY.md` | Proposta documental |
| F-12 | INFO | Privacy/LGPD | Agente LGPD | Tokens "fictícios" no README com formato realista | `README.md:31-37` | Proposta documental |
| F-13 | HIGH | Refactor | Agente refactor | `apijson` ↔ `apijsoncustom`: ~2 000 LOC duplicadas, alto risco de drift | `internal/apijson/*` vs `internal/apijsoncustom/*` | Fase 2 (épico) |
| F-14 | HIGH | Refactor | Agente refactor | 4 validators "requires-other-attribute" replicam ~300 LOC | `internal/customvalidator/requires*.go` | Fase 1 |
| F-15 | MEDIUM | Refactor | Agente refactor | `customfield/{list,set,map}` são clones mecânicos | `internal/customfield/{list,set,map}.go` | Fase 1 |
| F-16 | MEDIUM | Refactor | Agente refactor | `cmd/migrate/state.go`: cadeia de `if resourceType == ...` viraria map | `cmd/migrate/state.go:73-130` | Fase 1 (mas `cmd/migrate` é deprecado) |
| F-17 | MEDIUM | Refactor | Agente refactor | `acctest.go` ~25 funções `PreCheck_*` quase idênticas | `internal/acctest/acctest.go:73-316` | Fase 1 |
| F-18 | LOW | Refactor | Agente refactor | `cert_normalizations.go`: dois plan modifiers quase idênticos | `internal/utils/cert_normalizations.go:17-54` | Fase 1 |
| F-19 | LOW | Refactor | Agente refactor | `stripWrapper` reanalisa string a cada iteração (O(n²)) | `internal/utils/magic_utils.go:31-54` | Fase 2 |
| F-20 | LOW | Refactor | Agente refactor | `dynamicvalidator.compatible` ramifica em ~10 cases (CC ~13) | `internal/customvalidator/dynamicvalidator.go:22-91` | Fase 2 |
| F-21 | INFO | Processo | Revisão manual | CI tem `golangci-lint` e Semgrep, **não tem `gosec` nem `govulncheck`** | `.github/workflows/` | Proposta de processo |
| F-22 | INFO | Processo | `go list -m -u all` | 116 dependências atrás da última versão (patches) | `go.mod` | Proposta de processo |

---

## 3. Parecer de Conformidade LGPD

**Resumo:** O provider é uma ferramenta técnica neutra (operador no sentido LGPD). Não há "Não Conforme" identificado.

| Art. LGPD | Item | Classificação | Ação Corretiva |
|---|---|---|---|
| 7º / 11 | Bases legais | **Não Aplicável** | Esclarecer papel do provider no README |
| 6º — finalidade/adequação/necessidade | Minimização | **Conforme** | Manter |
| 6º — transparência | Documentação de dados transitados | **Parcialmente Conforme** | Adicionar `PRIVACY.md` ou seção em `docs/index.md` |
| 6º — segurança/prevenção | Credenciais | **Conforme** | Considerar redigir campos JSON sensíveis no logger (F-07) |
| 6º — não-discriminação / responsabilização | n/a | **Não Aplicável** | — |
| 18 | Direitos do titular | **Não Aplicável** | Responsabilidade do controlador (cliente Cloudflare) |
| 46-49 | Segurança e sigilo | **Conforme** | HTTPS por padrão; segredos via env var; atributos `Sensitive` |
| 37 | Registro de operações | **Parcialmente Conforme** | Documentar comportamento do `TF_LOG=DEBUG` |
| 48 | Incidentes | **Parcialmente Conforme** | `SECURITY.md` poderia mencionar fluxo LGPD/ANPD |
| 33-36 | Transferência internacional | **Parcialmente Conforme** | Nota em `docs/index.md` sobre a API operada nos EUA |

---

## 4. Plano de Aplicação Faseado

### Fase 0 — Já aplicado nesta branch (`claude/loving-hamilton-T8Fm8`)

| Mudança | Arquivo | Justificativa |
|---|---|---|
| `WriteFile(..., 0644)` → `0600` (2x) | `internal/acctest/acctest.go:1084,1110` | gosec G306 — arquivo de configuração de teste é mais restrito |
| `(default: false)` → `(default: true)` | `cmd/migrate/main.go:27` | Comentário do `flag.Bool("grit", ...)` divergia do valor real |
| `// Read the body without mutating the original response` → `request` (e linha seguinte) | `internal/logging/logging.go:60-62` | Comentário no fluxo do `LogRequest` referenciava "response" por copy-paste |

### Fase 1 — Próximo ciclo (PR seguinte, baixo risco)

| Mudança | Esforço | Risco |
|---|---|---|
| Consolidar `requiresOtherAttribute*Validator` em um base interno (F-14) | M | Baixo (testes existentes em `dynamicvalidator_test.go` cobrem) |
| Refatorar `cmd/migrate/state.go` para usar map de renames (F-16) | S | Baixo |
| Helpers `requireEnv`/`skipUnlessEnv` em `acctest.go` (F-17) | S | Baixo (só toca código de teste) |
| Extrair `requiresReplaceIfNotSemantic` em `cert_normalizations.go` (F-18) | XS | Baixo |
| Adicionar nota de transferência internacional em `docs/index.md` (F-10) | XS | — |
| Estender `SECURITY.md` com seção LGPD/ANPD (F-11) | XS | — |

### Fase 2 — Épico de redução de drift (PR dedicado, médio risco)

| Mudança | Esforço | Risco |
|---|---|---|
| Unificar `apijson` ↔ `apijsoncustom` (F-13) | L | Médio — precisa de testes adicionais em ambos os modos antes do merge |
| Genéricos em `customfield/{list,set,map}.go` (F-15) | M | Médio — superfície de tipos exposta a serviços gerados |
| Otimização O(n²) em `stripWrapper` (F-19) | S | Baixo |
| Decompor `dynamicvalidator.compatible` (F-20) | S | Baixo |
| **Redação de campos JSON sensíveis no logger (F-07)** — bodies de request/response em `DEBUG` podem conter tokens recém-criados, certificados e chaves privadas | M | Médio — precisa de lista whitelist de campos (`value`, `secret`, `private_key`, `token`, `client_secret`, `tunnel_secret`, etc.) com testes de regressão |

### Fase 3 — Dívida técnica registrada (sem prazo)

| Item | Por que adiar |
|---|---|
| Dependências atrás (116 pacotes, F-22) | Quase todas são bumps minor/patch indiretas; Stainless deve atualizá-las junto com a regeneração. Atualizar manualmente cria conflito de merge a cada `release-please`. |
| Substituir tokens fictícios do README por placeholders (F-12) | Cosmético; tokens são claramente exemplos |
| Refator amplo no código gerado | Inútil — Stainless sobrescreve |

---

## 5. Commits Propostos (Conventional Commits)

### Commit nesta branch (já feito ou a fazer)

```
fix(security): tighten test config file permissions to 0600

internal/acctest/acctest.go writes temporary v4 and provider .tf files
to tmpDir. Use 0600 instead of 0644 to satisfy gosec G306 and avoid
broader-than-needed permissions on test artifacts that may contain
credentials echoed from environment variables.

refactor(logging): fix copy-pasted "response" comments in LogRequest

The two inline comments in LogRequest referenced "the original response"
when they describe operations on the original request body. No behavior
change.

docs(cli): correct stale `--grit` default in cmd/migrate help text

The flag defaults to `true`, but the help string read `(default: false)`.
```

### Commits propostos para Fase 1

```
refactor(customvalidator): extract shared base for "requires-other-attribute" validators
refactor(migrate): replace if-chain with rename map in state.go
refactor(acctest): introduce requireEnv/skipUnlessEnv helpers
refactor(utils): collapse cert/CSR plan modifiers into shared helper
docs(privacy): document international data transfer in docs/index.md
docs(security): add LGPD/ANPD note to SECURITY.md
```

### Commits propostos para Fase 2

```
fix(security): redact sensitive JSON fields in debug HTTP logging
refactor(apijson): unify apijson and apijsoncustom packages
refactor(customfield): generic collection type for list/set/map
perf(utils): avoid quadratic re-parse in stripWrapper
refactor(customvalidator): simplify dynamicvalidator.compatible switch
```

---

## 6. Checklist de Validação Pós-Merge

Para a Fase 0 (aplicada agora):

- [ ] `go build ./...` passa
- [ ] `./scripts/lint` passa (golangci-lint v2, conforme `.golangci.yml`)
- [ ] `go test ./internal/acctest/...` (sem flags de aceitação) passa
- [ ] `go test ./internal/logging/...` passa
- [ ] `go build ./cmd/migrate/` passa
- [ ] Diff inspecionado: apenas 3 arquivos modificados, nenhuma mudança de comportamento de runtime
- [ ] CI principal (`ci.yml`) verde

Para Fase 1/2 (futuro):

- [ ] Cobertura de teste mantida ou aumentada nos pacotes refatorados
- [ ] Gosec sem novos `HIGH`/`MEDIUM`
- [ ] Smoke test de migração v4→v5 com um recurso representativo (ex.: `cloudflare_record`)

---

## 7. Recomendações de Processo (prevenir regressão)

### CI

1. **Adicionar `gosec` ao `.github/workflows/ci.yml`** em paralelo ao golangci-lint, falhando em `HIGH` com `confidence=HIGH` (configurar `--exclude-dir=internal/services` para evitar ruído em código gerado).
2. **Adicionar `govulncheck` num cron diário** — varre dependências contra o GoVuln DB sem rodar contra cada PR.
3. **Manter `semgrep --config=auto`** como já existe em `.github/workflows/semgrep.yml`; considerar promover findings High a *blocking*.
4. **Pinning de actions externas por SHA** (`actions/checkout@v6` está por tag; usar SHA evita supply-chain via tag mutável).

### Pre-commit hooks

Adicionar em `.git/hooks/pre-commit` (via `scripts/bootstrap`):

- `gosec -quiet -severity high -confidence high ./...` em paths não-gerados
- `gitleaks detect --no-banner` (detecção de segredos em commit local)

### Política de revisão

- PRs que tocam `internal/logging/`, `internal/provider.go` ou `internal/customvalidator/sensitive_regex.go` requerem review obrigatório de um security owner.
- PRs com diff em código gerado **e** em código humano devem ser separados (porque o regerado deveria ser uma operação atômica do bot Stainless).

### Documentação

- Criar `PRIVACY.md` com: (a) papel do provider sob LGPD/GDPR, (b) dados transitados, (c) jurisdição da Cloudflare Inc., (d) recomendações de tratamento do `terraform.tfstate`.
- Estender `SECURITY.md` para mencionar: superfície de log em `TF_LOG=DEBUG`, fluxo de incidente LGPD, DPO.

---

## 8. Anexos

### A. Findings detalhados do agente de refator

Ver seção "Phase 5 Audit" abaixo (10 findings priorizados).

### B. Findings detalhados do agente LGPD

Ver seção "Parecer LGPD" (10 itens artigo-a-artigo).

### C. Output gosec (resumo)

- 38 arquivos, 7 017 linhas analisadas (escopo não-gerado)
- 11 findings: 3 HIGH (todos test/dev), 8 MEDIUM (todos test/dev infra)
- 0 findings em código de runtime do provider

### D. Output git-secret-scan

- 0 segredos encontrados no histórico de todas as branches
- Matches do regex foram nomes de variáveis/strings de identificadores (`service_token`, `api_token`) sem valores reais

### E. Dependências desatualizadas

- 116 módulos com versão minor/patch disponível
- Recomendação: aguardar próximo `release-please` do Stainless ao invés de bump manual
