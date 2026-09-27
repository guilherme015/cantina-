#!/usr/bin/env bash
# Stop hook: bloqueia o fim do turno se o diff atual (não commitado) tocar
# área financeira ou auth/schema sem o subagente de revisão correspondente
# ter rodado depois da última mudança nesses arquivos.
#
# Rastreio pragmático: cada domínio guarda um marker com o hash do diff que
# foi revisado. Se o hash atual bater com o marker, considera revisado.
# Se o diff mudar (novo hash) ou o marker não existir, bloqueia de novo.
#
# Limitação conhecida: só enxerga mudanças NÃO commitadas (working tree +
# staged + untracked). Depois de um commit o diff correspondente já não
# aparece aqui — a rede de segurança seguinte é a revisão de PR/code-review.

set -uo pipefail

MARKER_DIR="/tmp/claude-cantina-hooks"
mkdir -p "$MARKER_DIR"

cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || exit 0

domain_diff() {
  local pathspec=("$@")
  {
    git diff HEAD -- "${pathspec[@]}" 2>/dev/null
    git status --porcelain --untracked-files=all -- "${pathspec[@]}" 2>/dev/null \
      | awk '{print $2}' \
      | while read -r f; do [ -f "$f" ] && cat "$f"; done
  }
}

check_domain() {
  local name="$1"
  shift
  local diff
  diff="$(domain_diff "$@")"
  if [ -z "$diff" ]; then
    return 0
  fi
  local hash
  hash="$(printf '%s' "$diff" | sha256sum | awk '{print $1}')"
  local marker="$MARKER_DIR/$name.marker"
  if [ -f "$marker" ] && [ "$(cat "$marker")" = "$hash" ]; then
    return 0
  fi
  printf '%s:%s\n' "$name" "$hash"
  return 1
}

messages=()

if out=$(check_domain financeiro-reviewer \
    'src/app/(dashboard)/financeiro' \
    'src/app/(dashboard)/vendas' \
    'src/app/actions/vendas.ts' \
    'src/app/actions/financeiro.ts'); then
  :
else
  hash="${out#*:}"
  messages+=("Diff toca area financeira (vendas/fiado/contas a pagar-receber/extrato). Invoque o subagente 'financeiro-reviewer' antes de terminar o turno. Depois rode: mkdir -p $MARKER_DIR && echo '$hash' > $MARKER_DIR/financeiro-reviewer.marker")
fi

if out=$(check_domain supabase-security-reviewer \
    'supabase/schema.sql' \
    'src/app/(auth)' \
    'src/app/auth'); then
  :
else
  hash="${out#*:}"
  messages+=("Diff toca schema do Supabase ou fluxo de auth. Invoque o subagente 'supabase-security-reviewer' antes de terminar o turno. Depois rode: mkdir -p $MARKER_DIR && echo '$hash' > $MARKER_DIR/supabase-security-reviewer.marker")
fi

if [ "${#messages[@]}" -gt 0 ]; then
  reason="$(printf '%s\n\n' "${messages[@]}")"
  jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
fi

exit 0
