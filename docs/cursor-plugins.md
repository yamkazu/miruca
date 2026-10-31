# Cursor 向けプラグイン（チーム共有）

正は **セットアップスクリプト**です。ponytail の skill 本文はリポジトリにベンダーしません（Claude の `setup:claude-plugins` と同じく、clone 後に初期化）。

## 初期化

```sh
npm run setup:cursor-plugins
# 任意: npm run setup:cursor-plugins -- --with-mattpocock
# 検証のみ: npm run setup:cursor-plugins -- --check-only
```

スクリプトが行うこと:

1. **`npx skills add DietrichGebert/ponytail -a cursor -y --skill '*'`** — 6 skills をプロジェクトの `.agents/skills/` へ（Cursor はここを自動発見）
2. **always-on rule** — upstream の `.cursor/rules/ponytail.mdc` を取得して配置
3. 任意で mattpocock（同じ `npx skills` パターン）
4. pstack — `agent` / `cursor-agent` があれば marketplace 登録を試し、だめなら `/add-plugin pstack` を案内

生成物（`.agents/skills/`、`.cursor/rules/ponytail.mdc`、`skills-lock.json`）は gitignore。Cloud Agents も環境セットアップで同じスクリプトを回せば揃う。

Claude Code 側は従来どおり `npm run setup:claude-plugins` と `.claude/settings.json`（このスクリプトは触らない）。

## ponytail review の呼び方

| 環境 | 呼び出し |
| --- | --- |
| Cursor Agent | **`/ponytail-review`**（setup 後、`.agents/skills/ponytail-review`） |
| Claude Code | `/ponytail-review`（プラグイン `ponytail@ponytail`） |

関連: `/ponytail`、`/ponytail-audit`、`/ponytail-debt`、`/ponytail-gain`、`/ponytail-help`。

上流の Cursor 向けフック（`cursor-hooks.js install --project`）は **ルールの代替**（レベル切替）。ルールがある間フックは注入しない。Cloud Agents は `sessionStart` を撃たないため、Miruca の既定は **npx skills + rule コピー**。

## 対応表

| 名前 | Claude | Cursor |
| --- | --- | --- |
| ponytail | `.claude/settings.json` → `ponytail@ponytail` | `npm run setup:cursor-plugins`（npx + rule） |
| pstack | marketplace / Actions | `/add-plugin pstack`（スクリプトが登録を試行） |
| mattpocock | `mattpocock-skills@mattpocock` | `--with-mattpocock` |

ポインタ: [.cursor/PONYTAIL.md](../.cursor/PONYTAIL.md)。
