# miruca のアーキテクチャ

0.1 の構成と、将来足すものを1枚にまとめた図です。範囲と要件は [PRD: miruca 0.1](prd/v0.1.md) にあります。点線の部分は 0.1 では作りません。

## 全体の構成

```mermaid
flowchart TB
  user["使う人（ブラウザ）"]
  op["運営者"]

  subgraph aws["AWS"]
    cf["CloudFront"]
    s3["S3<br/>React + Vite の画面"]
    subgraph api["API（Lambda Web Functions + Hono）"]
      direction TB
      auth["ログインとセッション<br/>（メールで届くリンク）"]
      connect["GitHub をつなぐ"]
      visible["visibleRepositories<br/>見てよいかの判定"]
      metrics["インサイトの計算<br/>（件数、リードタイム、人ごとの量）"]
      gh["GitHub の入り口<br/>応答を miruca の型に変換"]
      gl["GitLab の入り口"]
    end
    script["運営者用のスクリプト<br/>メールアドレスを許可する"]
    collector["定期収集"]
    ddb[("DynamoDB<br/>ユーザー、許可したメールアドレス、<br/>セッション、接続、リポジトリ")]
    sm[("Secrets Manager<br/>GitHub App の client secret、秘密鍵")]
    ses["Amazon SES<br/>ログイン用のリンク"]
  end

  subgraph ext["外部サービス"]
    direction LR
    ghapi["GitHub<br/>App のインストール、REST API、GraphQL API"]
    gitlab["GitLab"]
    sso["SSO<br/>（SAML、Google など）"]
    mail["使う人のメール"]
  end

  user --> cf
  cf -- "/*" --> s3
  cf -- "/api/*（OAC）" --> auth
  auth --> visible --> metrics
  auth --> connect
  op --> script
  script --> ddb
  auth --> ddb
  connect --> ddb
  visible --> ddb
  auth --> ses
  ses --> mail
  connect --> gh
  metrics --> gh
  visible --> gh
  gh --> sm
  gh --> ghapi
  metrics -.-> gl
  gl -.-> gitlab
  collector -.-> gh
  collector -.-> ddb
  auth -.-> sso

  classDef future stroke-dasharray: 5 5
  class gl,collector,sso,gitlab future
```

- CloudFront は `/api/*` を API に、それ以外を S3 に送ります。API は CloudFront の署名付きリクエスト（OAC）しか受け付けません。ここまでは今の構成と同じです。
- GitHub とのつなぎ方は Findy Team+ に合わせています。miruca にログインした状態で GitHub App をインストールし、インストールした組織のデータを見ます。
- ログインはメールで届くリンクだけです。使えるメールアドレスは、運営者がスクリプトで許可します。
- 0.1 では、GitHub をつないだ本人だけがその組織のデータを見ます。miruca の組織と招待は 0.1 の次で足します。
- PR のデータは GitHub App のインストールトークンで取ります。だから GitHub のアカウントを持たない人にも同じ数字を出せます。
- GitHub の応答は「GitHub の入り口」で miruca の型に変換します。判定と計算のコードは GitHub の型を知りません。
- 見てよいかの判定は `visibleRepositories` の1か所です。0.1 では、自分の接続のリポジトリだけを見られます。
- 将来は miruca の組織と招待、SSO、GitLab の入り口、定期収集を足します。0.1 では、GitHub と GitLab をまとめる共通のインターフェースは作りません。

## GitHub をつなぐまで

```mermaid
sequenceDiagram
  participant B as ブラウザ
  participant A as API
  participant G as GitHub
  participant D as DynamoDB

  B->>A: GET /api/connections/github/new
  A-->>B: state を cookie に入れ、App のインストール画面へリダイレクト
  B->>G: 組織とリポジトリを選んでインストール
  G-->>B: コールバックへリダイレクト（code、state、installation_id）
  B->>A: GET /api/connections/github/callback
  A->>A: state を cookie の値と照合する
  A->>G: code をユーザーのトークンに交換し、GET /user/installations
  A->>D: 返ってきたインストールそれぞれに、その人の接続を作る
  A->>A: ユーザーのトークンを捨てる
  A-->>B: リポジトリの一覧へ
```

## インサイトを表示するまで

```mermaid
sequenceDiagram
  participant B as ブラウザ
  participant A as API
  participant D as DynamoDB
  participant G as GitHub API

  B->>A: GET /api/repositories/{repositoryId}/insights?period=1w（cookie にセッション ID）
  A->>D: セッションからユーザーと接続を引く
  A->>A: visibleRepositories で、見てよいかを判定する
  alt 見てはいけない
    A-->>B: 404
  else 見てよい
    A->>G: インストールトークンで、期間内に作られた、マージされた、閉じた PR を取る（GraphQL の検索）
    A->>A: 件数、リードタイム、日ごとの数、人ごとの量を計算する
    A-->>B: RepositoryInsights
  end
```
