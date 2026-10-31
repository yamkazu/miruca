#!/bin/bash
# Claude Code プラグインをユーザースコープにインストールする。
# クラウド環境のセットアップスクリプトから呼ぶ: bash miruca/scripts/setup-claude-plugins.sh
# 追加・削除は下の2つのリストを編集する（ローカル用は .claude/settings.json も合わせて更新）。
MARKETPLACES="mattpocock/skills cursor/plugins krissman/ponytail"
PLUGINS="mattpocock-skills@mattpocock pstack@cursor-plugins ponytail@ponytail"

command -v claude >/dev/null || { echo "claude CLI not found; skip"; exit 0; }
for m in $MARKETPLACES; do claude plugin marketplace add "$m" || true; done
for p in $PLUGINS; do claude plugin install "$p" || true; done
exit 0
