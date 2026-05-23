# PROMPTS.md — Sequência de execução para Claude Code

> Cole cada bloco no Claude Code **na ordem**. Aguarde a fase fechar (commit + push) antes
> de passar para a próxima. Cada prompt presume que o anterior foi concluído com sucesso.
>
> Antes de começar:
> ```bash
> git init cloudflare-agentic-platform
> cd cloudflare-agentic-platform
> # copiar AGENTS.md, docs/projeto.md, e este PROMPTS.md para a raiz
> claude   # iniciar Claude Code
> ```

---

## Prompt 0 — Contexto inicial

```
Leia AGENTS.md e docs/projeto.md por completo. Depois confirme em uma frase
o objetivo do projeto e liste as 10 fases. Não escreva código ainda.
```

---

## Prompt 1 — Fase 0: Bootstrap do monorepo

```
Crie a estrutura completa do monorepo conforme descrito na seção 4 do
docs/projeto.md. Inclua:

- pnpm-workspace.yaml com workspaces apps/*, packages/*
- package.json raiz com scripts: typecheck, lint, test, eval, dev, deploy
- tsconfig.json base com strict:true, paths configurados
- .gitignore (node_modules, .wrangler, .dev.vars, dist)
- .editorconfig
- .nvmrc (Node LTS atual)
- README.md curto apontando para docs/projeto.md e AGENTS.md
- Diretórios vazios com .gitkeep onde ainda não há conteúdo

Use pnpm@latest. Não instale dependências ainda — apenas estrutura e config.
```

---

## Prompt 2 — Fase 3 (parte 1): Scaffold do MCP server

```
Em apps/mcp-server, faça scaffold do MCP server autenticado:

1. package.json com deps: agents, @modelcontextprotocol/sdk,
   @cloudflare/workers-oauth-provider, zod, hono (para o auth handler)
2. devDeps: wrangler, @cloudflare/workers-types, typescript, vitest
3. wrangler.jsonc conforme seção 3.5 do docs/projeto.md
   (substitua "<id>" por placeholders TODO claros)
4. tsconfig.json estendendo o base
5. src/index.ts — entrypoint OAuthProvider conforme seção 3.2
6. src/agent.ts — classe OpsAgent conforme seção 3.3
7. src/auth/index.ts — handler OAuth com fluxo mock para dev
   (página /authorize HTML simples; produção plugará Cloudflare Access)
8. src/tools/dns.ts — exemplo da seção 3.4
9. src/tools/{waf,access,observability}.ts — stubs com 1 tool cada
10. src/types.ts — tipo Props compartilhado

Rode pnpm install e pnpm typecheck. Corrija erros até passar limpo.
Faça commit: "feat(mcp): scaffold MCP server with OAuth provider".
```

---

## Prompt 3 — Fase 3 (parte 2): Audit log e HITL

```
No apps/mcp-server:

1. Adicione binding D1 "AUDIT" no wrangler.jsonc
2. Crie apps/mcp-server/migrations/0001_audit_log.sql com schema da seção 5
   (tabela audit_log com índices)
3. Implemente src/audit.ts com função logAction(env, entry) que escreve em D1
4. Refatore as tools para chamar logAction antes de retornar
5. Implemente src/hitl.ts com função requireApproval(server, toolName, args)
   usando elicitation do MCP SDK
6. Aplique requireApproval nas tools com prefixo delete_/disable_/rotate_
7. Adicione testes em test/audit.spec.ts e test/hitl.spec.ts (vitest + miniflare)

Rode pnpm test. Commit: "feat(mcp): add audit log and HITL approval flow".
```

---

## Prompt 4 — Fase 4: Agente autônomo

```
Em apps/autonomous-agent, faça scaffold do agente autônomo:

1. package.json com mesmas deps do mcp-server + @modelcontextprotocol/sdk
   client para chamar o MCP
2. wrangler.jsonc com triggers.crons conforme seção 4.1
3. src/agent.ts — classe AutonomousAgent estendendo McpAgent com onCron()
4. src/runbooks/health-check.ts — runbook simples que verifica /health
   de um conjunto de hostnames lidos de env var HOSTS
5. src/runbooks/dns-drift.ts — stub que loga "TODO" (implementação Fase 5)
6. src/triggers/cron.ts — dispatcher que mapeia cron expression → runbook
7. src/policies/approval.ts — categoriza ações em auto/async/sync conforme seção 4.4
8. Testes do health-check com fetch mockado

Commit: "feat(agent): scaffold autonomous agent with cron triggers".
```

---

## Prompt 5 — Fase 5: Code Mode + MCP oficial

```
1. Adicione em apps/autonomous-agent/src/mcp-clients.ts dois clients MCP:
   - opsMcp → mcp.<dominio>.com/mcp (nosso server)
   - cfMcp → api.mcp.cloudflare.com/mcp (oficial, Code Mode)
2. Implemente src/runbooks/dns-drift.ts de verdade:
   - Carrega estado declarado de infra/dns-zone/*.yaml
   - Chama cfMcp para listar registros reais
   - Compara; se houver drift, abre PR via tool github_open_pr (criar essa tool no ops-mcp)
3. Adicione tool github_open_pr no apps/mcp-server/src/tools/github.ts
   (usa GITHUB_TOKEN como secret via wrangler secret put)
4. Crie infra/dns-zone/example.yaml com 2-3 registros de exemplo

Commit: "feat(agent): implement DNS drift runbook with Code Mode".
```

---

## Prompt 6 — Fase 6: Skill distribuível

```
Em skills/cloudflare-ops:

1. SKILL.md conforme seção 6 do docs/projeto.md
2. slash-commands/dns-add.md — guia interativo
3. slash-commands/waf-incident.md — runbook WAF
4. slash-commands/cert-rotate.md — rotação cert
5. examples/ com 3 transcripts de uso correto
6. README.md explicando instalação em Claude Code, OpenCode, Cursor

Commit: "feat(skill): add cloudflare-ops agent skill package".
```

---

## Prompt 7 — Fase 9: CI/CD

```
1. .github/workflows/deploy-mcp.yml conforme seção 9 do docs/projeto.md
2. .github/workflows/deploy-agent.yml (análogo)
3. .github/workflows/eval-tools.yml — roda em PR, executa pnpm eval
4. .github/workflows/plan-on-pr.yml — comenta diff de infra/
5. .github/dependabot.yml — atualizações semanais
6. .github/CODEOWNERS

Documente em README.md como configurar os secrets:
CF_API_TOKEN, CF_ACCOUNT_ID, GITHUB_TOKEN.

Commit: "ci: add deploy workflows and PR checks".
```

---

## Prompt 8 — Fase 10: Hardening final

```
Antes do go-live:

1. Crie docs/runbooks/ com 1 markdown por runbook do agente
2. Crie docs/incident-response.md com playbook em caso de comportamento
   inesperado do agente (kill switch via wrangler tail + rollback)
3. Adicione tool emergency_pause em apps/mcp-server que para todos os
   crons setando uma flag em KV; agente checa essa flag em onCron
4. Adicione script scripts/rotate-secrets.ts
5. Atualize AGENTS.md marcando todas as fases como concluídas
6. Tag v1.0.0

Commit: "chore: harden for go-live with kill switch and runbook docs".
Tag: git tag v1.0.0 && git push --tags.
```

---

## Pós-execução — Checklist humano (não dá para o agente)

Antes de apontar tráfego real:

- [ ] Pen test externo das superfícies `mcp.*` e `agent.*`
- [ ] Tabletop com 2 cenários reais de incidente
- [ ] Validar que rollback funciona: `wrangler rollback`
- [ ] Confirmar que kill switch (`emergency_pause`) realmente para o agente
- [ ] Revisar políticas Access em produção
- [ ] Aprovação de segurança e compliance da empresa
