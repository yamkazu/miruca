# miruca

GitHub からチームのパフォーマンス（PR リードタイム、レビュー時間、スループット、DORA）を集めて見える化するダッシュボード。

## 構成

- `apps/api`: API（Hono、Lambda Web Functions で動く普通の HTTP サーバー）
- `apps/web`: フロント（React + Vite、S3 + CloudFront）
- `infra`: AWS CDK（TypeScript）
- `scripts/gate`: PR の品質ゲート（`.github/workflows/pr.yml` から呼ばれる）
- 詳しくは README.md、開発フローは docs/ai-workflow.md

## 規約

- TypeScript strict。`any` と non-null assertion（`!`）は避ける
- lint と整形は Biome（`npm run lint`、直すときは `npm run lint:fix`）
- テストは Vitest。`apps/*/test`、`infra/test`、`scripts/test` に置く
- ソースを変えたら、その振る舞いを確かめるテストを足すか直す
- 1つの PR は1つの Issue。関係ない整理やリファクタリングを混ぜない
- ユーザー向けの文言とドキュメントは日本語

## やらないこと

- `infra/` の IAM 権限を広げる、リソースを削除する変更を Issue に書かれていないのに行う
- 依存パッケージを Issue に書かれていないのに追加・更新する
- `.github/`、`CLAUDE.md`、`scripts/gate/` を Issue の指示なしに変える
- テストを消す・skip して通す

## AI の作業手順

GitHub Actions でも Claude のプロジェクトのスレッドでも同じ手順で進める。Actions では pstack の poteto-mode に従う。

1. Issue の背景と受け入れ条件、エージェントブリーフのコメント（/triage が書いたもの）があればそれも読む。曖昧で実装できないなら、コードを書かずに質問をコメントして `needs-info` ラベルを付けて止まる
2. ブランチを切る。Actions は `ai/issue-<番号>-<要約>`、プロジェクトのスレッドは `claude/` で始まる名前（品質ゲートはこの2つを AI の PR として扱う）
3. 受け入れ条件を満たす最小の変更を実装し、テストを足す
4. `npm run lint`、`npm run typecheck`、`npm test`、`npm run synth` をすべて通す。通るまで直す
5. 差分を見直す（関係ない変更が混ざっていないか、受け入れ条件を全部満たしたか）
6. `.github/pull_request_template.md` の形で PR を作る。`Closes #<番号>`、受け入れ条件ごとの対応、実行したコマンドと結果を書く
7. PR は自分でマージしない。品質ゲート（CI、AI レビュー、セキュリティレビュー、リスク判定）が自動マージか人間判断かを決める

品質ゲートから「品質ゲートからの修正依頼」コメントが来たら、CI の失敗と Important・Security の指摘を直して同じブランチに push する。Actions は指摘を出すだけで自動では直さない。プロジェクトのスレッドで作った PR は、そのスレッドが PR を見守って対応する。`@claude` コメントで呼ばれた Actions の Claude も、依頼された範囲だけを直す。

## Agent skills

### Issue tracker

Issues live in GitHub Issues for yamkazu/miruca. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`); `ready-for-agent` also starts the implementing agent in a Claude project thread (the project routine watches for the label). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created when needed. See `docs/agents/domain.md`.
