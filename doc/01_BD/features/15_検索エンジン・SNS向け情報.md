# FT-26 — 検索エンジン・SNS 向けの情報（2026-10-27 更新）

## 概要

公開サイトのページを LINE・X・Facebook などで共有したときのプレビュー（タイトル・説明・画像のカード）と、Google などの検索結果に出る内容を、ページごとに正しく出すための仕組み。

公開サイトは、ブラウザで JavaScript が動いてから画面を作る仕組み（SPA）になっている。各ページのタイトル・説明は画面ができてから JavaScript（`frontend/src/components/PageMeta.tsx`）で入れているが、SNS がプレビューを作るときは JavaScript を動かさないため、これまではどのページを共有してもサイト共通の情報しか出なかった。

2026-10-21 から、サーバーがページの入口（`index.html`）を返す時点で、開かれた URL に合わせた情報を入れて返す。あわせて、検索エンジン向けの `robots.txt` と `sitemap.xml` を返す。

2026-10-26 から、Habitat Oides と HUE の独立ドメインでは、許可されたホスト名に応じてブランド名・正式URL・OGP画像を切り替える。無関係なHostヘッダーを正式URLに使わない。ei8ht plants は `/` をブランドトップ、`/official` を公式サイトトップに分け、旧 `/ei8htplants` は `/` へ、従来の公式サイトURLは対応する `/official/...` へ正規化する。各ブランドの未知のパスは noindex にし、ei8ht plants のサイト情報を混ぜない。

## 言葉の説明

| 言葉 | 意味 |
|---|---|
| SEO | 検索エンジン最適化。Google などの検索結果にページを正しく載せてもらうための工夫 |
| OGP | SNS でリンクを共有したときに出るカード（タイトル・説明・画像）の情報。`og:` で始まる |
| X のカード | X（旧 Twitter）用の同じ情報。`twitter:` で始まる |
| canonical | ページの正式な URL。同じページに複数の URL があるとき、どれを使うかを検索エンジンに伝える |
| noindex | 「このページは検索結果に出さないで」という印 |
| 構造化データ | ページの中身（イベントの日時・会場など）を、機械が読める決まった形で Google に伝える情報。検索結果にイベントの日付などが出ることがある |
| robots.txt | 検索エンジンに「読んでよい範囲」を伝えるファイル |
| sitemap.xml | 検索エンジンに「このサイトにはこのページがある」と知らせる一覧 |
| クローラー | 検索エンジンや SNS が、ページを自動で読みに来るプログラム |

## 実装ファイル

- `backend/app/routes/seo.py`（ページごとの情報を決めて `index.html` に入れる・`robots.txt`・`sitemap.xml`）
- `backend/app/main.py`（`serve_spa` から `seo.render_spa_index` を呼ぶ。`seo.router` を登録）
- `frontend/src/components/PageMeta.tsx`（画面ができてから JavaScript で入れる側。値はサーバーと同じにしている）

## ページごとに入れる情報

どのページでも次のタグを入れる。値はすべて HTML の決まりに沿って安全な形に直してから入れる（記号を含むイベント名などで表示が崩れたり、悪いプログラムを入れられたりしないため）。

| 入れる情報 | 内容 |
|---|---|
| タイトル | ei8ht plants は「ページ名 \| ei8ht plants」。独立ブランドは各ブランド名をタイトル末尾に付け、各ブランドのトップはブランド名だけ |
| 説明文 | ページの説明。無ければサイト共通の説明 |
| 正式な URL（canonical） | 許可された現在のホスト名の正式ドメイン＋正規パス。存在しないページには入れない |
| noindex | 検索結果に出さないページだけ（下の表） |
| OGP | `og:type`（website）・`og:title`・`og:description`・`og:image`・`og:url`・ブランドに応じた `og:site_name`・`og:locale`（ja_JP） |
| X のカード | `twitter:card`・`twitter:title`・`twitter:description`・`twitter:image`。ページ固有の画像があるときは大きい画像のカード（`summary_large_image`）、無いときはロゴの小さいカード（`summary`） |
| 構造化データ | イベントのページとトップページだけ（下の「構造化データ」） |

画像が無いページは、サイトのロゴ（`https://ei8htplants.com/img/logo-ei8htplants.png`）を使う。

### ページの種類ごとの値

| パス | タイトル | 説明文 | 画像 |
|---|---|---|---|
| `/official/events/{slug または ID}` | イベント名 | イベントページのキャッチコピー・サブタイトル・コンセプトをつないだもの（最大 120 文字）。どれも無ければ「開催日 / 会場」 | イベントの1枚目の写真 |
| `/official/journal/{ID}` | 「記事名 \| Journal」 | 記事の本文の先頭（最大 120 文字）。本文が空なら記事名 | 本文の最初の画像、無ければ記事の1枚目の画像 |
| `/official/shop/{ID}` | 「商品名 \| Shop」 | 商品説明の先頭（最大 120 文字）。商品説明が空なら商品名 | 商品の1枚目の画像 |
| 固定ページ（`/`・`/about`・`/plants`・`/official`・`/official/events` など） | 各ページで決めた値（`PageMeta` と同じ。言語の切り替えがあるページは日本語） | 同じ | ページによる（ブランドページは各ブランドの画像） |

- `/official/events?page=past` のときはタイトルを「Past Events」にする
- イベントは、URL がイベントの ID（UUID）でも、イベントに slug（URL 用の短い名前）があれば、正式な URL（canonical・`og:url`）は slug の URL にする（`sitemap.xml` と同じ URL にそろえる）
- 記事・商品は公開中のものだけ。非公開の記事・商品は「存在しないページ」と同じ扱いにする
- イベント名が空のイベント、タイトルが空の記事、商品名が空の商品も「存在しないページ」と同じ扱いにする（noindex・canonical なし）

### 検索結果に出さないページ（noindex）

| 対象 | 理由 |
|---|---|
| `/admin` 以下 | 管理画面 |
| `/official/cancel` 以下（旧 `/cancel` を含む） | 予約キャンセル（お客さんごとの画面） |
| `/official/checkout` 以下（旧 `/checkout` を含む） | 購入手続き |
| `/official/order` 以下（旧 `/order` を含む） | 注文完了 |
| 存在しないイベント・記事・商品、非公開の記事・商品、名前（タイトル）が空のイベント・記事・商品、どの画面にも当たらないパス | 中身の無いページが検索結果に載らないようにする。サイト共通の情報に noindex を付け、正式な URL（canonical）は入れない。画面は SPA なので、ステータスは 200（「見つかりません」の 404 ではない） |

### 構造化データ

| ページ | 種類 | 内容 |
|---|---|---|
| ei8ht plants ブランドトップ（`/`）・公式サイトトップ（`/official`） | Organization（お店・団体） | 名前（ei8ht plants）・URL・ロゴ |
| イベントのページ | Event（イベント） | イベント名・開始・終了・会場（名前と住所）・画像（最大5枚）・説明・URL・主催（ei8ht plants） |

イベントの構造化データのきまり:

- 住所はイベントの「住所」、無ければイベントページの会場の住所を使う。**どちらも無いときは構造化データを入れない**（Google が必須としている項目がそろわないため。タイトルや OGP は入れる）
- 開始・終了は、開始の時刻と終了の時刻の**両方が分かるときだけ**日時（日本時間）にする。どちらかが分からなければ、両方とも日付だけにする（片方だけ日時だと、終了が開始より前と読まれることがあるため）
  - 開始の時刻: 開始日の「日別の時間」、無ければ「時間」（例「10:00〜17:00」）の1つ目の時刻
  - 終了の時刻: 終了日の「日別の時間」、無ければ「時間」の2つ目の時刻
- 開始日が読めないときは入れない

## キャッシュと失敗したとき

- イベント・記事・商品・sitemap の読み取り結果は、サーバーのメモリに **60 秒** 覚えておく（クローラーが続けて来てもデータベースに負担をかけないため）。そのため、管理画面でイベント名などを変えても、SNS 向けの情報に反映されるまで最大 60 秒かかる
- データベースの読み取りに失敗したときは、サイト共通の情報で返す（一時的な失敗なので noindex は付けない）
- 情報を入れる処理そのものが失敗したときは、元の `index.html` をそのまま返す（画面は今までどおり表示される）

## robots.txt（`GET /robots.txt`）

返す内容:

```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /cancel
Disallow: /checkout
Disallow: /order
Disallow: /official/cancel
Disallow: /official/checkout
Disallow: /official/order

Sitemap: https://ei8htplants.com/sitemap.xml
```

- `/api` は読まないようにはしない。Google はページを表示するときに JavaScript を動かして `/api/...` からイベントや記事の中身を読むため、ここを止めるとページの中身が読めず、検索結果に載らなくなる
- `Sitemap:` のURLはアクセスしたドメインに合わせる。ei8ht plants は `https://ei8htplants.com/sitemap.xml`、Habitat Oides は `https://habitatoides.com/sitemap.xml`、HUE は `https://huebyei8htplants.com/sitemap.xml`

## sitemap.xml（`GET /sitemap.xml`）

検索エンジンに知らせるページの一覧。Hostヘッダーが登録済みの独立ブランドドメインなら、そのブランド専用の一覧を返す。

| 載せるもの | URL | 更新日 |
|---|---|---|
| ei8ht plants のブランドページ（ei8htplants.com） | `/`・`/about`・`/plants` | 入れない |
| 公式サイトの固定ページ（ei8htplants.com） | `/official`・`/official/brands`・`/official/events`・`/official/gallery`・`/official/shop`・`/official/journal`・`/official/concept`・`/official/contact`・`/official/stockists`・`/official/collaborations`・`/official/media`・`/official/chat`・`/official/legal`・`/official/privacy` | 入れない |
| Habitat Oides の固定ページ | `/`・`/workshop`・`/collaborations`（`habitatoides.com` 上） | 入れない |
| HUE by ei8ht plants の固定ページ | `/`・`/about`・`/choose`・`/living`（`huebyei8htplants.com` 上） | 入れない |
| イベント（全件） | slug があれば `/official/events/{slug}`、無ければ `/official/events/{ID}` | 入れない |
| 公開中の記事 | `/official/journal/{ID}` | 公開日（無ければ作成日） |
| 公開中の商品 | `/official/shop/{ID}` | 作成日 |

- `/official/reserve`（予約フォーム）はイベントの指定が必要なので載せない。noindex のページも載せない
- ei8ht plants のサイトマップには、ブランド専用ドメインへ移した Habitat Oides・HUE の旧パスを載せない
- 作った一覧は 60 秒覚えておく。イベント・記事・商品のどれかの読み取りに失敗したときは、読めた分だけで返し、覚えておかない（次に来たときに作り直す）

## 関係するページ

- [BD-01 システム構成](../01_システム構成.md) の「検索エンジン・SNS 向けの情報」
- [BD-02 画面遷移図](../02_画面遷移図.md) の「画面ではない URL」
- [DD-04 バックエンドロジック](../../02_DD/04_バックエンドロジック.md) の「SPA フォールバック」「検索エンジン・SNS 向けの情報」
- [DD-06 API仕様](../../02_DD/06_API仕様.md) の「SEO（robots.txt・sitemap.xml）」
- [FT-27 ブランド別ドメインとサイト表示](16_ブランド別ドメインとサイト表示.md)
- 公開後の確かめ方は [OP-02 運用・保守マニュアル](../../05_OP/02_運用・保守マニュアル.md) の「SNS のプレビューと検索エンジン向けの確認」
