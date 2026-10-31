#!/bin/bash
# Cursor 向け: ponytail + mattpocock skills をプロジェクトに入れる（clone 後に一度）
# npm run setup:cursor-plugins
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes skills@latest add DietrichGebert/ponytail -a cursor -y --skill '*'
npx --yes skills@latest add mattpocock/skills -a cursor -y
