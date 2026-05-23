# Infra-as-code

Configurações declarativas dos recursos Cloudflare. **Source of truth** —
qualquer divergência do que está aqui é considerada drift e (idealmente)
levanta PR automático via runbook `dns-drift`.

## Estrutura

```
infra/
├── access-policies/    # Cloudflare Access (apps + groups + policies)
├── ai-gateway/         # AI Gateway config (cache, fallback, rate limit)
├── dns-zone/           # Estado declarado de cada zona DNS
└── waf-rules/          # WAF managed rulesets + custom rules
```

## Como aplicar

Hoje: manual via dashboard ou API (Terraform provider opcional).
Roadmap: pipeline GitOps que aplica diffs via `cloudflare-terraform`.

### Manual via API

```bash
# Exemplo: aplicar custom rate-limit
curl -X PUT \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @infra/waf-rules/custom-rate-limit.json
```

### Via Terraform (recomendado para produção)

Use o provider `cloudflare/cloudflare` — todos os arquivos JSON aqui
podem ser referenciados via `file()` ou `jsondecode()`.

```hcl
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = var.zone_id
  kind    = "zone"
  name    = "rate-limit"
  phase   = "http_ratelimit"
  rules   = jsondecode(file("${path.module}/../infra/waf-rules/custom-rate-limit.json")).rules
}
```

## Convenções

- Arquivos `*.json` são payloads diretos da API Cloudflare — copiar do
  dashboard via "View / Export" e versionar
- Arquivos `*.yaml` são abstrações de mais alto nível (DNS), parseadas
  pelos runbooks
- Comentários em JSON via `_comment` (string ignorada pela API)
- Toda mudança via PR + review do `agents-admin`
