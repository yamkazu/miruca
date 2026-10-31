# Issue 駆動の AI 開発フロー

Issue に `ai:ready` を付けると、Claude が実装・検証して PR を作り、CI と品質ゲートを通ったものは自動でマージされます。迷うものだけ人間に回ります。

```
Issue + ai:ready
  → Claude が実装し、lint / 型 / テスト / synth を自分で通して PR を作る   (.github/workflows/claude.yml)
  → CI                                                                    (pr.yml: ci)
  → AI レビュー + セキュリティレビュー（並列）                            (pr.yml: ai-review, security-review)
  → 品質ゲート                                                            (pr.yml: quality-gate → scripts/gate)
       pass  → auto-merge ラベル + squash で自動マージ予約
       fix   → Claude が指摘を直して push（最大 3 回）→ もう一度 CI から
       human → needs-human ラベル + あなたをレビュアーに指定
  → main にマージされたら AWS にデプロイ                                  (deploy.yml)
```

設計は Anthropic の [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/) を参考にしています。

## あなたがやること

- Issue をテンプレートで書く。**受け入れ条件**がレビューと自動マージの基準になります
- `ai:ready` を付ける
- `ai:question` が付いたら質問に答え、`@claude 回答しました` とコメントして再開
- `needs-human` の PR を見て、マージするか `@claude <直してほしいこと>` とコメント

## 品質ゲートの判定

リスクは**変更の中身**で決めます（作者では決めません）。自動マージは既定で「低」だけです。

| リスク | 例 | 結果 |
| --- | --- | --- |
| 低 | ドキュメント、文言、テストだけ、既存の動きを変えない追加 | 自動マージ |
| 中 | apps/ の通常の機能追加・バグ修正 | 人間 |
| 高 | `infra/`、`.github/`、`scripts/gate/`、`CLAUDE.md`・`REVIEW.md`・`biome.json`、`package.json`・lock | 人間（AI の判定に関係なく） |

ほかに次のどれかに当たると人間に回ります: AI 以外が作った PR、AI 以外のコミットが混ざった PR、差分が 400 行超（lock 除く）、AI レビューが「人間の判断が必要」とした PR。

次のものは**マージを止めて** Claude に修正を依頼します（3 回で直らなければ人間へ）: セキュリティの指摘、Important の指摘、ソースを変えたのにテストの変更がない。

判定はコミット単位です。新しいコミットが来ると自動マージ予約とラベルを外して判定し直します。

自動マージの範囲はリポジトリ変数 `AUTO_MERGE_MAX_TIER` で変えられます（`none` / `low` / `medium`、既定 `low`）。判定ロジックは `scripts/gate/decide.mjs`、テストは `scripts/test/gate.test.ts` です。

## 初期設定（リポジトリ管理者が1回だけ）

すべてブラウザ（スマホ可）でできます。

1. **Claude の認証**: https://console.anthropic.com/settings/keys で API キーを作り、GitHub の Settings → Secrets and variables → Actions → New repository secret に `ANTHROPIC_API_KEY` として登録（PC で `claude setup-token` を実行できる場合は、代わりに `CLAUDE_CODE_OAUTH_TOKEN` でサブスクリプション枠を使えます）
2. **Claude GitHub App**: このリポジトリにインストールされていること（https://github.com/apps/claude）。Claude が作る PR で CI が動くのはこのアプリのトークンを使うため
3. **マージ設定**: Settings → General → Pull Requests で
   - 「Allow squash merging」だけオン（merge commit と rebase はオフ）
   - 「Allow auto-merge」をオン
   - 「Automatically delete head branches」をオン
4. **Actions の権限**: Settings → Actions → General → Workflow permissions で「Allow GitHub Actions to create and approve pull requests」をオン
5. **ブランチのルール**: Settings → Rules → Rulesets → New branch ruleset
   - Target: `main`（Include default branch）
   - Enforcement: Active
   - Bypass list: Repository admin（あなたが判断して手でマージできるように）
   - Require a pull request before merging（Required approvals は **0**。AI の承認は人間の承認として数えないので、承認必須にすると自動マージが止まります）
   - Require status checks to pass: `ci` と `quality-gate` を追加（「Require branches to be up to date」はオフ。オンにすると main が進むたびに自動マージが止まります）
   - Block force pushes
6. **ラベル**: Actions タブ → Labels → Run workflow（main へのマージ時にも1回動きます）
7. 任意: Settings → Secrets and variables → Actions → Variables に `HUMAN_REVIEWER`（既定はリポジトリのオーナー）

## CI からのデプロイ

`main` が変わるたびに `.github/workflows/deploy.yml` が AWS にデプロイします（自動マージのあとも動きます）。AWS のアクセスキーは保存せず、GitHub の OIDC で一時的な権限を受け取ります。初回は CDK の bootstrap もこのワークフローが行います。

AWS 側の設定（AWS コンソールで1回だけ、ブラウザで可）:

1. IAM → ID プロバイダ → プロバイダを追加
   - プロバイダのタイプ: OpenID Connect
   - プロバイダの URL: `https://token.actions.githubusercontent.com`
   - 対象者: `sts.amazonaws.com`
2. IAM → ロール → ロールを作成
   - 信頼されたエンティティ: ウェブアイデンティティ、ID プロバイダ `token.actions.githubusercontent.com`、Audience `sts.amazonaws.com`
   - GitHub 組織: `yamkazu`、GitHub リポジトリ: `miruca`、GitHub ブランチ: `main`
   - 許可ポリシー: `AdministratorAccess`（初回の bootstrap で IAM ロールなどを作るため。安定したら CDK の `cdk-hnb659fds-*` ロールを引き受ける権限だけに絞れます）
   - ロール名: `miruca-github-deploy`
3. 作ったロールの ARN（`arn:aws:iam::<アカウントID>:role/miruca-github-deploy`）をコピー

GitHub 側の設定:

1. Settings → Secrets and variables → Actions → Variables → New repository variable
   - `AWS_DEPLOY_ROLE_ARN` = 上の ARN
   - 任意: `AWS_REGION`（既定 `ap-northeast-1`）
2. Actions タブ → Deploy → Run workflow（以後は main へのマージで自動）。完了すると実行結果の Summary に CloudFront の URL が出ます

`AWS_DEPLOY_ROLE_ARN` が未設定の間はデプロイのジョブは何もせずスキップします。

## ローカルで同じことをする

Claude Code をローカルで使うときも `CLAUDE.md` の「AI の作業手順」に従います。PR を作れば同じ品質ゲートが走ります（あなたが作った PR は自動マージされず、人間判断になります）。
