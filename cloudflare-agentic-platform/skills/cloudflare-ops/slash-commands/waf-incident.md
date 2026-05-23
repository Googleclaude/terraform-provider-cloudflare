# /waf-incident

Resposta a incidente WAF.

## Fluxo
1. Verifique a métrica que disparou o incidente (`audit_log_recent` filtrando por waf_*)
2. Avalie magnitude (req/s, países origem, paths atacados)
3. Recomende ação:
   - Pequeno: regra custom específica
   - Médio: elevar security_level para "high"
   - Grande: ativar modo "under_attack"
4. Mostre plano e peça confirmação
5. Aplique via tool waf_set_security_level
6. Agende verificação em 15 min
