# miruca のアーキテクチャ

0.1 の構成と、将来足すものを1枚にまとめた図です。範囲と要件は [PRD: miruca 0.1](prd/v0.1.md) にあります。点線の部分は 0.1 では作りません。

## 全体の構成

```mermaid
flowchart TB
  user["使う人（ブラウザ）"]

  subgraph aws["AWS"]
    cf["CloudFront"]
    s3["S3<br/>React + Vite の画面"]
    subgraph api["API（Lambda Web Functions + Hono）"]
      direction TB
      auth["ログインとセッション"]
      visible["visibleRepositories<br/>見てよいかの判定"]
      metrics["指標の計算<br/>（リードタイムの中央値など）"]
      gh["GitHub の入り口<br/>応答を miruca の型に変換"]
      gl["GitLab の入り口"]
    end
    collector["定期収集"]
    ddb[("DynamoDB<br/>ユーザー、ログイン手段、セッション、<br/>組織、接続、リポジトリ")]
    sm[("Secrets Manager<br/>GitHub App の client secret、秘密鍵")]
  end

  subgraph ext["外部サービス"]
    direction LR
    ghoauth["GitHub<br/>ユーザー認可（OAuth）"]
    ghapi["GitHub<br/>REST API"]
    gitlab["GitLab"]
    idp["GitHub 以外のログイン手段<br/>（Google、SAML など）"]
  end

  user --> cf
  cf -- "/*" --> s3
  cf -- "/api/*（OAC）" --> auth
  auth --> visible --> metrics
  metrics --> gh
  visible --> gh
  metrics -.-> gl
  collector -.-> gh
  auth --> ddb
  visible --> ddb
  collector -.-> ddb
  gh --> sm
  auth --> ghoauth
  gh --> ghapi
  gl -.-> gitlab
  auth -.-> idp

  classDef future stroke-dasharray: 5 5
  class gl,collector,idp,gitlab future
```

- CloudFront は `/api/*` を API に、それ以外を S3 に送ります。API は CloudFront の署名付きリクエスト（OAC）しか受け付けません。ここまでは今の構成と同じです。
- ユーザー、組織、リポジトリには miruca が ID を発行して、DynamoDB に置きます。GitHub のアカウントはログイン手段の1つ、GitHub App のインストールは組織の接続の1つとして扱います。
- GitHub の応答は「GitHub の入り口」で miruca の型に変換します。判定と計算のコードは GitHub の型を知りません。
- 将来は GitLab の入り口、GitHub 以外のログイン手段、定期収集を足します。0.1 では、GitHub と GitLab をまとめる共通のインターフェースは作りません。

## リードタイムを表示するまで

```mermaid
sequenceDiagram
  participant B as ブラウザ
  participant A as API
  participant D as DynamoDB
  participant G as GitHub API

  B->>A: GET /api/repositories/{repositoryId}/lead-time（cookie にセッション ID）
  A->>D: セッションからユーザーとログイン手段を引く
  A->>G: ユーザーのトークンで、アクセスできるリポジトリを取る
  A->>A: visibleRepositories で、見てよいかを判定する
  alt 見てはいけない
    A-->>B: 404
  else 見てよい
    A->>G: インストールトークンで、直近30日にマージされた PR を取る
    A->>A: リードタイムと中央値を計算する
    A-->>B: LeadTimeReport
  end
```

ユーザーのトークンは「見てよいか」の判定にだけ使います。PR のデータは GitHub App のインストールトークンで取ります。将来、GitHub のアカウントを持たない経営者に全体を見せるときは、`visibleRepositories` の判定だけを変えれば済みます。
