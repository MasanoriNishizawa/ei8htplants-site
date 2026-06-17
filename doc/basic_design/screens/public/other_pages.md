# 画面設計：その他公開ページ

静的または単純なデータ表示のページ。

---

## コンセプト（`/concept`）

- テンプレート: `templates/concept.html`
- 静的コンテンツ。API 呼び出しなし
- ブランドのコンセプトテキストと画像

---

## Specimen（`/specimen`）

- テンプレート: `templates/specimen.html`
- Sheets の `Specimen` シートから品種名と画像（最大3枚）を取得
- 画像なしの品種は表示しない

---

## ei8ht plants（`/ei8htplants`）

- テンプレート: `templates/ei8htplants.html`
- Sheets の `Specimen` シートから先頭6件のプレビュー
- Drive `ei8ht_plants` フォルダから8枚のギャラリープレビュー

---

## Habitat Oides（`/habitatoides`）

- テンプレート: `templates/habitatoides.html`
- Drive `habitat_oides` フォルダから8枚のギャラリープレビュー

---

## Habitat Oides WS一覧（`/habitatoides/workshop`）

- テンプレート: `templates/habitatoides_workshop.html`
- 販売ブランドに「Habitat Oides」を含む開催予定イベントのうち `WSフラグ = TRUE` のものを表示

---

## HUE（`/hue`）

- テンプレート: `templates/hue.html`
- Drive `hue` フォルダから8枚のギャラリープレビュー

---

## Collaborations（`/collaborations`）

- テンプレート: `templates/collaborations.html`
- Sheets の `PROJECTS` シートから全案件を取得
- 画像列（カンマ区切り Drive URL）をリスト化してテンプレートへ
