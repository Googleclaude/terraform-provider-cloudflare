# /cert-rotate

Rotação de certificado de origem.

## Fluxo
1. Liste certs prestes a expirar (próximos 30d)
2. Para cada um, gere novo cert via API
3. Atualize origem
4. Valide TLS handshake do edge
5. Revogue o antigo após 24h (agendar com schedule())
