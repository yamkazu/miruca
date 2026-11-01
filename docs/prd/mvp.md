# PRD: miruca MVP

## 目的

miruca は、チームの開発の流れを GitHub のデータから数字で見せるサービスです。MVP では、使う人が GitHub でログインし、自分が所属する組織のリポジトリを選んで、PR リードタイムを見られるところまでを作ります。

MVP で確かめたいのは次の2つです。

- GitHub App をインストールしてログインするまでの流れが、組織の管理者と使う人の両方にとって迷わないか。
- 1つの数字（PR リードタイム）が、チームが振り返りに使える形で出せるか。

## 使う人

| 人 | やること |
| --- | --- |
| 組織の管理者 | 自分の組織に miruca の GitHub App をインストールし、対象のリポジトリを選ぶ |
| チームのメンバー | GitHub でログインし、自分が見られるリポジトリの PR リードタイムを見る |

## 範囲

### MVP に入れるもの

1. GitHub でログインする、ログアウトする。
2. 自分が見られる組織とリポジトリの一覧を見る。
3. 選んだリポジトリの、直近30日にマージされた PR のリードタイムを見る。

### MVP に入れないもの

- 定期的なデータ収集と保存。表示のたびに GitHub API を呼ぶ。
- 複数のリポジトリをまとめた集計、チーム単位の集計。
- PR リードタイム以外の指標（レビュー時間、スループット、DORA）。
- グラフ、期間の切り替え、CSV の出力。
- miruca 独自のユーザー管理、権限管理、課金。

これらは MVP を使った人の反応を見てから、別の PRD か Issue で扱います。

## 使う人の流れ

1. 組織の管理者が GitHub App「miruca」をインストールし、対象のリポジトリを選ぶ。
2. メンバーが miruca を開き、「GitHub でログイン」を押す。
3. GitHub の認可画面で許可すると、miruca に戻る。
4. 自分が見られる組織とリポジトリが一覧で出る。
5. リポジトリを選ぶと、直近30日にマージされた PR の一覧とリードタイムの中央値が出る。

## 機能要件

### F1. ログインとログアウト

- GitHub App のユーザー認可（OAuth の流れ）でログインする。
- 認可の要求には `state` を付け、戻ってきたときに照合する。一致しなければログインを失敗にする。
- ログインに成功すると、ブラウザには HttpOnly、Secure、SameSite=Lax の cookie でセッション ID だけを渡す。
- GitHub のトークン（アクセストークンとリフレッシュトークン）はサーバー側に保存し、ブラウザには渡さない。
- アクセストークンの期限が切れていたら、リフレッシュトークンで取り直す。取り直せなければログアウトした状態にし、ログイン画面に戻す。
- ログアウトするとセッションを消し、cookie も消す。

### F2. 組織とリポジトリの一覧

- ログインした人のトークンで、GitHub API の `GET /user/installations` と `GET /user/installations/{installation_id}/repositories` を呼ぶ。
- 一覧に出すのは、miruca がインストールされていて、かつその人がアクセスできるリポジトリだけ。miruca 側で所属を管理しない。
- 一覧が空のときは、「所属する組織に miruca がインストールされていません」と表示し、管理者にインストールを頼むための案内を出す。

### F3. PR リードタイム

- 対象は、選んだリポジトリで直近30日（今の時刻から 30 × 24 時間前まで）にマージされた PR。
- リードタイムは「PR を作った時刻からマージされた時刻まで」とする。ドラフトだった期間も含める。
- 画面には次のものを出す。
  - 対象の PR の件数
  - リードタイムの中央値（時間単位、小数第1位まで）
  - PR の一覧（番号、タイトル、作成者、リードタイム、GitHub へのリンク）。リードタイムの長い順に並べる
- 対象の PR が0件のときは、「直近30日にマージされた PR はありません」と表示する。
- 集計する PR は最大1000件とする。1000件を超えたら、集計が最新の1000件分であることを画面に表示する。

## データの形

```ts
type Session = {
  sessionId: string;
  githubUserId: number;
  login: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type InstallationList = {
  installations: {
    id: number;
    account: { login: string; type: 'Organization' | 'User' };
    repositories: { id: number; fullName: string }[];
  }[];
};

type LeadTimeReport = {
  repository: string;
  since: string;
  until: string;
  count: number;
  truncated: boolean;
  medianHours: number | null;
  pullRequests: {
    number: number;
    title: string;
    author: string;
    url: string;
    createdAt: string;
    mergedAt: string;
    leadTimeHours: number;
  }[];
};
```

GitHub API の応答は API の入り口でこれらの型に変換し、画面には GitHub の生の応答を渡さない。

## API

| メソッドとパス | 役割 |
| --- | --- |
| `GET /api/auth/login` | GitHub の認可画面へリダイレクトする |
| `GET /api/auth/callback` | 認可コードをトークンに交換し、セッションを作る |
| `POST /api/auth/logout` | セッションを消す |
| `GET /api/me` | ログインしている人の `login` を返す。未ログインなら 401 |
| `GET /api/installations` | `InstallationList` を返す |
| `GET /api/repos/:owner/:repo/lead-time` | `LeadTimeReport` を返す。その人が見られないリポジトリなら 404 |

## インフラの変更

MVP では次のものを足します。どれも IAM の権限を広げるか、リソースを足す変更なので、該当する Issue に明記します。

- セッションを保存する DynamoDB テーブル（TTL でセッションの期限切れを消す）
- GitHub App の client ID、client secret を置く Secrets Manager のシークレット
- API の Lambda がこのテーブルを読み書きし、シークレットを読むための IAM 権限

GitHub App の作成と、コールバック URL（CloudFront の URL + `/api/auth/callback`）の登録は、リポジトリの管理者が GitHub の画面で1回だけ行います。

## 成功の基準

- 組織の管理者がインストールしてから、メンバーが最初の数字を見るまで、追加の設定なしでたどり着ける。
- miruca の数字が、GitHub の PR の作成時刻とマージ時刻から手で計算した値と一致する。
- アクセス権のないリポジトリの数字は、URL を直接打っても見られない。

## Issue の分け方

1. GitHub App でログイン、ログアウトし、自分が見られる組織とリポジトリの一覧を出す（F1、F2、インフラの変更すべて）。
2. 選んだリポジトリの PR リードタイムを出す（F3）。

## 未決事項

PRD を書いた時点で、次のことは仮に決めています。変えるときはこの PRD を直してから Issue を書きます。

| 項目 | 仮の決定 | ほかの案 |
| --- | --- | --- |
| 「プロジェクト」の単位 | GitHub の組織と、その中のリポジトリ | miruca 上で複数のリポジトリを束ねた単位 |
| 導入の形 | 組織の管理者が GitHub App をインストールする | 個人がそれぞれ OAuth App で認可する |
| 最初の指標 | PR リードタイム | レビュー時間、スループット |
| リードタイムの起点 | PR を作った時刻 | PR の最初のコミットの時刻 |
| ボットの PR | 含める | Dependabot などを除く |
