#!/bin/bash
# Cursor 向けプラグイン／skills／rules をセットアップする（チーム共有の正）。
# clone 後に一度実行: npm run setup:cursor-plugins
# Claude 側の対応物: scripts/setup-claude-plugins.sh（.claude/settings.json）
#
# 中心:
#   npx skills add DietrichGebert/ponytail -a cursor   # 6 skills → .agents/skills/
#   upstream .cursor/rules/ponytail.mdc をプロジェクトへコピー（always-on）
#   任意: mattpocock
#   pstack: プロジェクトスコープはコミット済み .cursor/settings.json（plugins.pstack）
#
# 生成物は gitignore（.agents/skills/、.cursor/rules/ponytail.mdc、skills-lock.json）。
# オプション: --with-mattpocock / --check-only / --skip-rules

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_MATTPOCOCK=0
CHECK_ONLY=0
SKIP_RULES=0
for arg in "$@"; do
  case "$arg" in
    --with-mattpocock) WITH_MATTPOCOCK=1 ;;
    --check-only) CHECK_ONLY=1 ;;
    --skip-rules) SKIP_RULES=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $arg (use --with-mattpocock, --check-only, --skip-rules)" >&2
      exit 1
      ;;
  esac
done

fail=0
warn() { echo "WARN: $*" >&2; }
ok() { echo "OK: $*"; }
info() { echo "→ $*"; }

PONYTAIL_SKILLS=(ponytail ponytail-review ponytail-audit ponytail-debt ponytail-gain ponytail-help)
PONYTAIL_RULE=".cursor/rules/ponytail.mdc"
PONYTAIL_RULE_URL="https://raw.githubusercontent.com/DietrichGebert/ponytail/main/.cursor/rules/ponytail.mdc"
PONYTAIL_REPO="DietrichGebert/ponytail"

check_ponytail_installed() {
  local missing=0
  local name path
  for name in "${PONYTAIL_SKILLS[@]}"; do
    path=".agents/skills/${name}/SKILL.md"
    if [[ -f "$path" ]]; then
      ok "$path"
    else
      warn "missing $path (run without --check-only)"
      missing=1
    fi
  done
  if [[ -f "$PONYTAIL_RULE" ]]; then
    ok "$PONYTAIL_RULE"
  else
    warn "missing $PONYTAIL_RULE (always-on rule; run setup without --skip-rules)"
    missing=1
  fi
  return "$missing"
}

install_ponytail_skills() {
  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found; cannot install ponytail skills"
    return 1
  fi
  info "npx skills add ${PONYTAIL_REPO} -a cursor (all six skills, project scope)"
  # -y: non-interactive; -a cursor: Cursor agent dirs; --skill '*': all skills in the package
  if npx --yes skills@latest add "$PONYTAIL_REPO" -a cursor -y --skill '*'; then
    ok "ponytail skills installed under .agents/skills/ (Cursor discovers .agents/skills)"
    return 0
  fi
  warn "npx skills add ${PONYTAIL_REPO} failed"
  return 1
}

install_ponytail_rule() {
  mkdir -p .cursor/rules
  info "Fetching always-on rule from ${PONYTAIL_RULE_URL}"
  if command -v curl >/dev/null 2>&1; then
    if curl -fsSL "$PONYTAIL_RULE_URL" -o "$PONYTAIL_RULE"; then
      ok "wrote $PONYTAIL_RULE"
      return 0
    fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q -O "$PONYTAIL_RULE" "$PONYTAIL_RULE_URL"; then
      ok "wrote $PONYTAIL_RULE"
      return 0
    fi
  else
    warn "curl/wget not found; cannot fetch ponytail.mdc"
    return 1
  fi
  warn "failed to download $PONYTAIL_RULE"
  return 1
}

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  info "check-only: verify local install (no network writes)"
  if check_ponytail_installed; then
    ok "ponytail ready — invoke /ponytail-review in Cursor Agent"
    exit 0
  fi
  warn "ponytail not fully installed; run: npm run setup:cursor-plugins"
  exit 1
fi

info "Installing ponytail for Cursor (skills via npx, rule via upstream raw file)"
if ! install_ponytail_skills; then
  fail=1
fi

if [[ "$SKIP_RULES" -eq 1 ]]; then
  info "skip-rules: not writing $PONYTAIL_RULE"
  info "optional level-switching hooks (alternative to the rule): clone DietrichGebert/ponytail && node …/cursor-hooks.js install --project"
else
  if ! install_ponytail_rule; then
    fail=1
  fi
fi

if [[ "$WITH_MATTPOCOCK" -eq 1 ]]; then
  if command -v npx >/dev/null 2>&1; then
    info "npx skills add mattpocock/skills -a cursor"
    if npx --yes skills@latest add mattpocock/skills -a cursor -y; then
      ok "mattpocock skills installed (review .agents/skills before committing if you un-ignore them)"
    else
      warn "mattpocock install failed"
      fail=1
    fi
  else
    warn "npx not found; skip mattpocock"
    fail=1
  fi
else
  info "mattpocock skipped (pass --with-mattpocock to install)"
fi

PSTACK_SETTINGS=".cursor/settings.json"
if [[ -f "$PSTACK_SETTINGS" ]] && grep -q '"pstack"' "$PSTACK_SETTINGS" && grep -q '"enabled"[[:space:]]*:[[:space:]]*true' "$PSTACK_SETTINGS"; then
  ok "pstack project scope: $PSTACK_SETTINGS (plugins.pstack.enabled)"
  info "After pull: Cursor で Developer: Reload Window。UI の Project install が失敗したらこのファイルが回避策"
else
  warn "missing project-scoped pstack in $PSTACK_SETTINGS — expect { \"plugins\": { \"pstack\": { \"enabled\": true } } }"
  fail=1
fi

if check_ponytail_installed; then
  ok "ponytail review: /ponytail-review in Cursor Agent chat"
else
  fail=1
fi

cat <<'EOF'

Cursor plugin setup (Miruca)
  Team share = run this script after clone (ponytail files are gitignored; not vendored).

  Skills (npx → .agents/skills/):  /ponytail-review  /ponytail  /ponytail-audit …
  Rule (fetched → .cursor/rules/ponytail.mdc): always-on lazy senior mode
  pstack (project): committed .cursor/settings.json → Reload Window
  mattpocock: npm run setup:cursor-plugins -- --with-mattpocock

  Claude: npm run setup:claude-plugins  (.claude/settings.json — unchanged by this script)

  See docs/cursor-plugins.md
EOF

exit "$fail"
