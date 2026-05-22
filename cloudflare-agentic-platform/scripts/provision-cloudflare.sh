#!/usr/bin/env bash
# provision-cloudflare.sh — cria KV/D1 e aplica migrations.
# Idempotente: re-execução é segura (wrangler retorna o recurso existente).
#
# Uso:
#   ./scripts/provision-cloudflare.sh           # cria recursos
#   ./scripts/provision-cloudflare.sh --apply   # também aplica IDs aos wrangler.jsonc

set -euo pipefail

APPLY_IDS=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY_IDS=true ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
  esac
done

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "== provisioning Cloudflare resources =="
echo "root: $ROOT"
echo

# ---------- KV ----------
echo "→ KV namespace OAUTH_KV"
KV_OUT="$(cd apps/mcp-server && npx wrangler kv namespace create OAUTH_KV 2>&1 || true)"
echo "$KV_OUT"
KV_ID="$(echo "$KV_OUT" | grep -oE 'id\s*=\s*"[a-f0-9]+"' | head -1 | sed -E 's/.*"([a-f0-9]+)".*/\1/' || true)"
if [[ -z "${KV_ID:-}" ]]; then
  KV_ID="$(echo "$KV_OUT" | grep -oE '"id":\s*"[a-f0-9]+"' | head -1 | sed -E 's/.*"([a-f0-9]+)".*/\1/' || true)"
fi
echo "KV_ID=${KV_ID:-<not parsed — check output>}"
echo

# ---------- D1 ----------
echo "→ D1 database audit-log"
D1_OUT="$(cd apps/mcp-server && npx wrangler d1 create audit-log 2>&1 || true)"
echo "$D1_OUT"
D1_ID="$(echo "$D1_OUT" | grep -oE 'database_id\s*=\s*"[a-f0-9-]+"' | head -1 | sed -E 's/.*"([a-f0-9-]+)".*/\1/' || true)"
if [[ -z "${D1_ID:-}" ]]; then
  D1_ID="$(echo "$D1_OUT" | grep -oE '"uuid":\s*"[a-f0-9-]+"' | head -1 | sed -E 's/.*"([a-f0-9-]+)".*/\1/' || true)"
fi
echo "D1_ID=${D1_ID:-<not parsed — check output>}"
echo

# ---------- aplicar IDs aos wrangler.jsonc (opcional) ----------
if $APPLY_IDS; then
  if [[ -z "${KV_ID:-}" || -z "${D1_ID:-}" ]]; then
    echo "ERRO: KV_ID ou D1_ID não puderam ser parseados — atualize wrangler.jsonc manualmente."
    exit 1
  fi
  for f in apps/mcp-server/wrangler.jsonc apps/autonomous-agent/wrangler.jsonc; do
    if [[ -f "$f" ]]; then
      sed -i.bak \
        -e "s/TODO_REPLACE_WITH_KV_ID/${KV_ID}/g" \
        -e "s/TODO_REPLACE_WITH_D1_ID/${D1_ID}/g" \
        "$f"
      rm -f "${f}.bak"
      echo "✓ atualizado $f"
    fi
  done
fi

# ---------- aplicar migrations (remoto) ----------
echo
echo "→ aplicando migrations D1 (remoto)"
if $APPLY_IDS; then
  (cd apps/mcp-server && npx wrangler d1 migrations apply audit-log --remote)
else
  echo "Skip — IDs ainda em TODO_. Re-execute com --apply após confirmar IDs."
fi

# ---------- resumo ----------
echo
echo "=========================================="
echo "Resumo:"
echo "  OAUTH_KV (KV):     ${KV_ID:-?}"
echo "  audit-log (D1):    ${D1_ID:-?}"
echo "=========================================="
if ! $APPLY_IDS; then
  cat <<EOF

Próximos passos:
  1. Edite apps/{mcp-server,autonomous-agent}/wrangler.jsonc:
       substitua TODO_REPLACE_WITH_KV_ID → ${KV_ID:-?}
       substitua TODO_REPLACE_WITH_D1_ID → ${D1_ID:-?}
  2. Aplique migrations:
       cd apps/mcp-server && npx wrangler d1 migrations apply audit-log --remote
  3. Configure secrets:
       npx wrangler secret put CLOUDFLARE_API_TOKEN
       npx wrangler secret put GITHUB_TOKEN

Ou re-execute com:
   ./scripts/provision-cloudflare.sh --apply
EOF
fi
