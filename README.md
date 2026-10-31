# miruca

GitHub からチームのパフォーマンス（PR リードタイム、レビュー時間、スループット、DORA メトリクスなど）を集めて見える化するダッシュボードです。

いまは第1段階として、AWS 上で **React + Vite のフロントから Lambda Web Functions の API を呼んで Hello を表示する** ところまでが動きます。

## 構成

```
CloudFront ─┬─ /*      → S3（React + Vite の静的ファイル、OAC）
            └─ /api/*  → Lambda Web Function（Node.js 24 + Hono、IamAuth + OAC）
```

| 場所 | 中身 |
| --- | --- |
| `apps/api` | API（Hono）。`AWS_LAMBDA_HTTP_ENDPOINT` で指定されたアドレスで待ち受ける普通の HTTP サーバー |
| `apps/web` | フロント（React + Vite） |
| `infra` | AWS CDK（TypeScript） |
| `scripts/bundle.mjs` | API を esbuild で `dist/api/index.js` に1ファイル化 |

API は CloudFront の署名付きリクエスト（OAC）しか受け付けないため、Web Function のエンドポイント URL を直接叩いても 403 になります。

## 開発の進め方

Issue に `ready-for-agent` ラベルを付けると Claude のプロジェクトが実装して PR を作り、品質ゲートを通ったものは自動でマージされます。詳しくは [docs/ai-workflow.md](docs/ai-workflow.md)。

## ローカルで動かす

Node.js 22 以上が必要です。

```sh
npm install
npm run dev:api   # http://127.0.0.1:8787/api/hello
npm run dev:web   # http://localhost:5173 （/api は 8787 にプロキシ）
```

テストと型チェック:

```sh
npm test
npm run typecheck
```

## AWS にデプロイする

1. AWS の認証情報を用意し、デプロイ先リージョンを決めます（既定は `ap-northeast-1`。変えるときは `CDK_DEFAULT_REGION` で、Lambda Web Functions の対応リージョンを選んでください）。
2. 初回のみ CDK をブートストラップします。

   ```sh
   npm run cdk -w @miruca/infra -- bootstrap
   ```

3. デプロイします。フロントのビルドと API のバンドルも一緒に行います。

   ```sh
   npm run deploy
   ```

   完了すると `Miruca.Url` に CloudFront の URL が出ます。開くと「Hello from Lambda Web Functions!」と表示されます。

テンプレートだけ確認したいときは `npm run synth` です。

## メモ

- Lambda Web Functions は `aws-cdk-lib` 2.275.0 以降の L1（`CfnWebFunction` / `CfnWebFunctionRevision` / `CfnWebFunctionEndpoint`）で定義しています。
- CDK CLI の CloudFormation Validate がまだこれらのリソース型を知らないため、該当ルール（F3006）を acknowledge しています（[cloudformation-validate#479](https://github.com/aws-cloudformation/cloudformation-validate/issues/479)）。
- CDK の `HttpOrigin` は OAC を指定できないので、API 側オリジンにはプロパティオーバーライドで OAC を付けています。
