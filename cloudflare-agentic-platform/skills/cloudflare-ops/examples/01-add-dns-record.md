# Exemplo: adicionar registro DNS

**User:** Cria um A record api.exemplo.com.br apontando para 203.0.113.10

**Agent:**
Vou criar um A record proxied em exemplo.com.br:
- nome: api
- conteúdo: 203.0.113.10
- ttl: 300, proxied: true

Chamando `dns_create_record`...

✅ Criado. ID: `abc123`. Registro no audit log: `audit_xyz`.
