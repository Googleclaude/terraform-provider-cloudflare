---
name: cloudflare-ops
description: Use sempre que o usuário pedir para diagnosticar, alterar ou
  provisionar recursos Cloudflare na conta — DNS, WAF, Access, Workers, R2,
  AI Gateway, certs, túneis. Não use para perguntas conceituais sobre
  Cloudflare; só para operações reais na conta.
---

# Cloudflare Ops

## Quando usar
- Pedidos com verbos: criar, alterar, rotacionar, deletar, listar, auditar
- Menções a: DNS, WAF, Access, Workers, R2, túneis, certs

## Como usar
1. Sempre conecte ao MCP `ops-mcp` primeiro (operações curadas)
2. Se a operação não existir lá, use `cloudflare-api` em Code Mode
3. Antes de qualquer mudança destrutiva, mostre plano e peça confirmação
4. Após executar, registre no audit log via tool `audit_log_record`

## Slash commands disponíveis
- `/dns-add` — guia interativo para adicionar registro DNS
- `/waf-incident` — abre runbook de incidente WAF
- `/cert-rotate` — rotação de certificado de origem

## Padrão de resposta
1. Resumir o que será feito (1 linha)
2. Mostrar args/payload exato (JSON)
3. Pedir confirmação se destrutivo
4. Executar
5. Mostrar resultado + ID no audit log
