# Cursor 向けプラグイン（チーム共有）

Miruca は Claude Code 用に `.claude/settings.json` でプラグインを有効化している。Cursor では **リポジトリにコミットした `.cursor/`** を正とし、全員と Cloud Agents が同じ rules / skills を使う。

## すぐ使う: ponytail review

| Claude Code | Cursor |
| --- | --- |
| `/ponytail-review`（プラグイン `ponytail@ponytail`） | **`/ponytail-review`**（プロジェクト skill `.cursor/skills/ponytail-review/`） |

Agent チャットで `/` を押し、`ponytail-review` を選ぶ。差分の過剰設計だけを見るレビュー（`delete` / `stdlib` / `native` / `yagni` / `shrink`）。正しさやセキュリティは通常レビュー／`REVIEW.md` 側。

関連スキル（同じ場所）: `/ponytail`、`/ponytail-audit`、`/ponytail-debt`、`/ponytail-gain`、`/ponytail-help`。  
常時の「lazy senior」ルールは `.cursor/rules/ponytail.mdc`（`alwaysApply: true`）。

由来・更新手順は [.cursor/PONYTAIL.md](../.cursor/PONYTAIL.md)。上流: [krissman/ponytail](https://github.com/krissman/ponytail)（MIT）。

## 初期化（チーム・クラウド）

```sh
npm run setup:cursor-plugins
# 検証だけ: npm run setup:cursor-plugins -- --check-only
# mattpocock もプロジェクトにコピー: npm run setup:cursor-plugins -- --with-mattpocock
```

スクリプトは次を行う。

1. コミット済みの ponytail rules / skills の存在確認（欠けていれば失敗）
2. `agent` / `cursor-agent` があれば `cursor/plugins` marketplace を登録し、可能なら pstack を install（CLI が非対話 install 未対応なら案内だけ）
3. 任意で `npx skills` による mattpocock 導入

marketplace プラグインをスクリプトだけで必須インストールできない場合がある。そのときは Cursor の **Customize → Plugins** で **project scope** に入れるか、チャットで `/add-plugin pstack`。

Claude 側の対応スクリプト: `npm run setup:claude-plugins`（変更していない）。

## プラグイン対応表

| 名前 | Claude | Cursor（このリポジトリ） |
| --- | --- | --- |
| ponytail | `.claude/settings.json` → `ponytail@ponytail` | **コミット**: `.cursor/rules` + `.cursor/skills` |
| pstack | marketplace + Actions | marketplace / `/add-plugin pstack`（スクリプトが登録を試行） |
| mattpocock-skills | `mattpocock-skills@mattpocock` | 任意: `--with-mattpocock` または Customize |

## なぜ in-repo か

Cursor のプロジェクト skills は `.cursor/skills/**/SKILL.md` を自動発見する（[Agent Skills](https://cursor.com/docs/skills)）。ユーザースコープや個人の `~/.cursor` だけだと Cloud Agents / 他メンバーに届かない。ponytail の上流 Cursor アダプタは rules のみだが、Miruca は skills も `.cursor/skills` に置き、Claude と同じ `/ponytail-review` を Cursor で使えるようにしている。
