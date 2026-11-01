# 類似プロダクトの構成

miruca 0.1 の設計（ログイン、見られる範囲、データの取り方）を決めるために、類似プロダクトの公開情報を調べた。調べたのは 2026年11月1日。

## 出典の確かさ

- **直接読んだもの。** GitHub の Findy Team+ の App ページと、Four Keys のリポジトリ。
- **検索結果の要約から拾ったもの。** Swarmia、LinearB、Findy Team+ のヘルプ。どれも各社の公式ヘルプが出典だが、ページそのものは読めていない。`help.swarmia.com` と `jp.findy-team.io` は、この作業環境のネットワーク設定で開けなかった。
- **見つからなかったもの。** Jellyfish のログイン手段と、Findy Team+ の役割の種類。

## まとめ

| | Findy Team+ | Swarmia | LinearB | Four Keys |
| --- | --- | --- | --- | --- |
| 連携先 | GitHub、GitLab、Bitbucket、Jira、Slack | GitHub（Enterprise Server を含む）など | GitHub など | GitHub、GitLab など（Webhook） |
| GitHub との接続 | GitHub App | GitHub App | GitHub App の OAuth か、個人のトークン | Webhook |
| 接続する人 | Findy Team+ の管理者で、GitHub の組織の Owner | GitHub の管理者 | 組織の管理者（管理者でなければ個人のトークン） | 自分で立てる |
| データの取り方 | 不明 | 不明 | Webhook でほぼ即時。Webhook がなければ約2時間ごとに取りに行く | Webhook を受けて BigQuery に保存 |
| ログイン | SAML の SSO（Okta、Microsoft Entra ID、HENNGE One など5つ） | 既定は GitHub。Google Workspace か Okta の SSO に切り替えられる | 招待。Google Workspace の SAML SSO（サポートに頼んで有効にする） | なし（Grafana） |
| 見られる範囲 | 不明 | GitHub で管理するときは GitHub の組織のメンバー。SSO にすると、GitHub 上のアクセス権に関係なく、つないだすべての組織のデータが見える | Admin、Editor、Viewer。Editor と Viewer はチーム単位で絞る | なし |
| 複数の GitHub の組織 | 対象の組織すべてに App を入れる | 組織ごとに App を入れ、1つの Swarmia にまとめる | 不明 | 不明 |

## プロダクトごとのメモ

### Findy Team+

- 対象の組織とリポジトリに GitHub App「Findy Team+」を入れて連携する。入れる人は、Findy Team+ の管理者で、かつ GitHub の組織の Owner である必要がある。
- Findy Team+ にログインしたまま App を入れないと、データが正しくつながらないことがある、と App のページに書かれている。App のインストールと Findy Team+ 側のアカウントを、ログイン中の状態で結びつけていると読める（推測）。
- SAML の SSO に対応している。GMO トラスト・ログインとは 2024年5月から、CloudGate UNO とは 2024年11月から連携しており、その時点で HENNGE One、Microsoft Entra ID、Okta を含む5つになった。
- App が要求する権限の一覧は、App のページに載っていなかった。

### Swarmia

- GitHub の管理者が Marketplace から GitHub App を入れる。最初に Swarmia を GitHub につないだ人が管理者になる。
- 既定では、アクセスの管理を GitHub に任せる。GitHub の組織のメンバーなら誰でも GitHub でログインできる。
- Google Workspace か Okta の SSO に切り替えられる。切り替えるには、App が入っていることと Swarmia の管理者であることが要る。切り替えると、ほかのログイン手段は使えなくなる。既存の人は、次のログインで GitHub のアカウントと SSO のアカウントを紐づける。個人の Google アカウントは使えない。
- SSO にすると、GitHub 上のアクセス権に関係なく、つないだすべての GitHub の組織のデータが見える。
- 複数の GitHub の組織を、1つの Swarmia にまとめられる（組織ごとに App を入れる）。
- チームは GitHub のチームから取り込める。

### LinearB

- GitHub App を通した OAuth か、個人のトークンでつなぐ。組織の管理者でない人のために、個人のトークンの方法がある。
- 個人のトークンで要るスコープは `repo`、`read:org`、`read:user`。リポジトリに Webhook を付けてほぼ即時にデータを受け取る。Webhook を付ける権限がなければ、約2時間ごとに取りに行く。組織単位の Webhook も使える。
- 見えるリポジトリは、つないだアカウントかトークンのアクセス権で決まる。
- 人を2種類に分けている。データの上の開発者（contributor）と、ログインする人（user）。開発者として登録しても、ログインはできない。
- ログインする人は管理者が招待する。役割は Admin、Editor、Viewer。Editor と Viewer は見られるチームを絞る。
- Google Workspace の SAML SSO と SCIM に対応している。どちらも既定では無効で、サポートに頼んで有効にする。SSO で初めて入った人は Viewer になる。

### Four Keys（Google）

- GitHub などの Webhook を Cloud Run で受け、Pub/Sub を経由して BigQuery に保存する。指標は BigQuery のビュー（SQL）で計算し、Grafana で見せる。
- 2024年1月23日にアーカイブされ、今は保守されていない。

### Jellyfish

- GitHub、GitLab、Bitbucket、Jira などと OAuth で連携する。設定が複雑で時間がかかるというレビューがある。
- ログイン手段は、調べた範囲では見つからなかった。

## miruca への示唆

1. **ユーザーの持ち方は、Swarmia と LinearB の中間にあたる。** 0.1 の設計は、開発者は GitHub の権限で見る（Swarmia の既定）、マネージャーは招待して全体を見る（LinearB の Viewer、Swarmia の SSO）の組み合わせになっている。どちらにも前例があるので、この方向で進めてよい。
2. **1つの組織に、複数の GitHub の組織をつなげる形が普通。** Swarmia も Findy Team+ も、複数の GitHub の組織に App を入れて1つにまとめる。PRD の未決事項「0.1 の組織」は、「1つの組織に複数のインストール」に変える方がよい。マネージャーが会社全体を見る、という 0.1 の目的にも合う。
3. **「データ上の開発者」と「ログインする人」を分ける。** LinearB はこの2つを分けている。miruca でも、PR の作成者（GitHub のアカウント）と miruca のユーザーは別のものとして扱う。0.1 の `LeadTimeReport.pullRequests[].author` は GitHub の login の文字列なので、今のところ問題はない。人ごとの指標を作るときに、作成者とユーザーを紐づける型を足す。
4. **データは保存して見せるのが普通。** Four Keys と LinearB は Webhook でデータを受けて保存する。0.1 の「表示のたびに GitHub API を呼ぶ」は、試す段階の割り切り。リポジトリや PR が多い組織では、表示が遅くなり、GitHub API の利用上限にもかかる。0.1 の次の候補として、Webhook と定期収集で保存する形を早めに検討する。
5. **企業向けには SSO が求められる。** Findy Team+ は SAML の IdP 5つ、Swarmia は Google Workspace と Okta、LinearB は Google Workspace の SAML に対応している。0.1 のメールでのログインは最初の手段として置き、次に Google Workspace か SAML を足す。
6. **見せる範囲をチーム単位で絞る機能は、どこも持っている。** LinearB は役割をチーム単位で絞り、Swarmia は GitHub のチームを取り込む。0.1 では作らないが、`Membership` に範囲を持たせる今の前提で足せる。

## 出典

- [GitHub Apps - Findy Team+](https://github.com/apps/findy-team)
- [Findy Team+ が Bitbucket 連携に対応（ファインディ）](https://findy.co.jp/1937/)
- [GMO トラスト・ログインと Findy Team+ の SAML 連携（GMO）](https://group.gmo/pdf/news/gmo_news_8963.pdf)
- [Swarmia: Get started in 15 minutes](https://help.swarmia.com/organization-setup)
- [Swarmia: Managing users and roles](https://help.swarmia.com/configuration/teams-and-members/managing-users-and-roles)
- [Swarmia: Google Single Sign-On](https://help.swarmia.com/getting-started/integrations/authentication/google-single-sign-on)
- [Swarmia: Multiple GitHub organizations](https://help.swarmia.com/getting-started/integrations/github/multiple-github-organizations)
- [LinearB: GitHub Cloud integration](https://linearb.helpdocs.io/article/2hmbgxtzaj-gh-cloud-integration)
- [LinearB: How to invite new users](https://linearb.helpdocs.io/article/2pxgiw6etp-how-to-invite-new-users)
- [LinearB: Configuring SAML SSO with G Suite](https://linearb.helpdocs.io/article/1grgp9a1q7-configuring-saml-sso-with-gsuite)
- [dora-team/fourkeys](https://github.com/dora-team/fourkeys)
- [Jellyfish（Sacra）](https://sacra.com/c/jellyfish)
