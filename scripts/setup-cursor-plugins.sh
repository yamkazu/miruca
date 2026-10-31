#!/bin/bash
# Cursor 向けプラグイン／skills／rules をチームで揃えるためのセットアップ。
# クラウドやローカルの初期化から呼ぶ: bash scripts/setup-cursor-plugins.sh
# npm: npm run setup:cursor-plugins
#
# 方針:
# - ponytail の rules / skills はリポジトリにコミット済み（.cursor/）。Cloud Agents も clone だけで使える。
# - pstack / mattpocock は marketplace または skills CLI。スクリプトは冪等に登録・検証し、
#   CLI だけで完結しない部分は明確な次の手順を出す（失敗しても exit 0 で環境セットアップを止めない）。
#
# オプション:
#   --with-mattpocock   npx skills で mattpocock/skills をプロジェクトの Cursor 向けに入れる
#   --check-only        検証と案内だけ（marketplace / npx を触らない）

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_MATTPOCOCK=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --with-mattpocock) WITH_MATTPOCOCK=1 ;;
    --check-only) CHECK_ONLY=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $arg (use --with-mattpocock or --check-only)" >&2
      exit 1
      ;;
  esac
done

fail=0
warn() { echo "WARN: $*" >&2; }
ok() { echo "OK: $*"; }
info() { echo "→ $*"; }

# --- 1) In-repo ponytail (durable team share) ---------------------------------
REQUIRED=(
  .cursor/rules/ponytail.mdc
  .cursor/skills/ponytail/SKILL.md
  .cursor/skills/ponytail-review/SKILL.md
  .cursor/skills/ponytail-audit/SKILL.md
  .cursor/skills/ponytail-debt/SKILL.md
  .cursor/skills/ponytail-gain/SKILL.md
  .cursor/skills/ponytail-help/SKILL.md
)

info "Checking committed Cursor ponytail wiring under $ROOT/.cursor"
for f in "${REQUIRED[@]}"; do
  if [[ -f "$f" ]]; then
    ok "$f"
  else
    warn "missing $f (re-copy from https://github.com/krissman/ponytail)"
    fail=1
  fi
done

if [[ "$fail" -eq 0 ]]; then
  ok "ponytail review: invoke /ponytail-review in Cursor Agent chat (skill name: ponytail-review)"
else
  warn "ponytail in-repo files incomplete; Cursor will not see /ponytail-review until they are restored"
fi

# --- 2) Resolve Cursor agent CLI (optional marketplace steps) -----------------
find_agent_cli() {
  if command -v agent >/dev/null 2>&1; then
    echo agent
    return 0
  fi
  if command -v cursor-agent >/dev/null 2>&1; then
    echo cursor-agent
    return 0
  fi
  return 1
}

AGENT_CLI=""
if AGENT_CLI="$(find_agent_cli)"; then
  ok "Cursor agent CLI: $AGENT_CLI"
else
  warn "agent / cursor-agent CLI not on PATH; skip marketplace registration"
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  info "check-only: skip marketplace and npx steps"
else
  # Official Cursor plugins marketplace (pstack lives here)
  if [[ -n "$AGENT_CLI" ]]; then
    info "Registering cursor/plugins marketplace (idempotent if already added)"
    if "$AGENT_CLI" plugin marketplace add https://github.com/cursor/plugins.git 2>/dev/null \
      || "$AGENT_CLI" plugin marketplace add https://github.com/cursor/plugins 2>/dev/null \
      || "$AGENT_CLI" plugin marketplace add cursor/plugins 2>/dev/null; then
      ok "marketplace cursor/plugins registered (or already present)"
    else
      warn "could not register marketplace via CLI; in Cursor: Customize → add marketplace github.com/cursor/plugins"
    fi

    info "Attempting pstack install (CLI may not support non-interactive install yet)"
    if "$AGENT_CLI" plugin install pstack@cursor-plugins 2>/dev/null \
      || "$AGENT_CLI" plugin install pstack 2>/dev/null; then
      ok "pstack install command succeeded"
    else
      warn "pstack not installed by CLI. In Cursor Agent chat run: /add-plugin pstack"
      warn "or Customize → Plugins → install pstack (project scope preferred for the team)"
    fi
  fi

  # mattpocock: optional project copy via skills CLI (large); not required for ponytail
  if [[ "$WITH_MATTPOCOCK" -eq 1 ]]; then
    if command -v npx >/dev/null 2>&1; then
      info "Installing mattpocock/skills for Cursor into this project (npx skills)"
      if npx --yes skills@latest add mattpocock/skills -a cursor -y; then
        ok "mattpocock skills installed for Cursor (review git status before committing)"
      else
        warn "npx skills add mattpocock/skills failed"
      fi
    else
      warn "npx not found; cannot install mattpocock skills"
    fi
  else
    info "mattpocock skipped (pass --with-mattpocock to copy skills into the project)"
  fi
fi

# --- 3) Human summary ---------------------------------------------------------
cat <<'EOF'

Cursor plugin status (Miruca)
  Committed (clone だけで Cloud Agents / チーム共有):
    .cursor/rules/ponytail.mdc          always-on lazy senior mode
    .cursor/skills/ponytail-*/SKILL.md  /ponytail-review など

  Try ponytail review:
    Cursor Agent のチャットで /ponytail-review
    または「この差分を over-engineering 観点で review して」

  Marketplace (手元の Cursor / agent CLI):
    pstack     → /add-plugin pstack  （または Customize から project scope で Install）
    mattpocock → npm run setup:cursor-plugins -- --with-mattpocock
                 または npx skills@latest add mattpocock/skills -a cursor -y

  Claude Code 側は従来どおり:
    npm run setup:claude-plugins
    （.claude/settings.json の ponytail@ponytail 等）

詳しくは docs/cursor-plugins.md
EOF

# Missing committed files is a hard failure for CI / local check; marketplace gaps are soft.
exit "$fail"
