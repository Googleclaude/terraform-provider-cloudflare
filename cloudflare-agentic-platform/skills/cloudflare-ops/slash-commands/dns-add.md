# /dns-add

Adicionar registro DNS de forma guiada.

## Fluxo
1. Pergunte qual zona (se houver múltiplas)
2. Tipo: A, AAAA, CNAME, TXT, MX
3. Nome (FQDN ou prefixo da zona)
4. Conteúdo (IP, hostname, etc)
5. TTL (default 300) e proxied (default true)
6. Resuma e peça confirmação
7. Chame `dns_create_record` no ops-mcp (idempotente)
8. Retorne o ID do registro criado
