# PG-A23 — Habitat Oides 画像（Admin）【廃止（2026-11-05）】

## 廃止

この画面（サイドメニューの「Habitat Oides 画像」）は、2026-11-05 に廃止した。ページの画像を変える管理画面は [PG-A24 ページ画像の編集](24_PageEditor.md) だけにした。画面の部品（`frontend/src/pages/admin/HabitatImages.tsx`）も削除し、サイドメニューにも出さない。

同じ日に、HUE の6枚の写真を変える「サイト画像」（`/admin/site-images`。ID・ページ設計書はなかった画面）も同じ理由で廃止した。

## 転送先

| 廃止した URL | 開いたときに移る先 |
|---|---|
| `/admin/habitat-images` | `/admin/page-editor/habitat-oides`（[PG-A24](24_PageEditor.md) の「Habitat Oides」のタブ） |
| `/admin/site-images` | `/admin/page-editor/hue`（[PG-A24](24_PageEditor.md) の「HUE」のタブ） |

転送は `frontend/src/App.tsx` のルートで行う。

## 保存していた画像

この画面で保存した11枠（一番上の画像 01〜05・オブジェクト 01〜06）の画像は、PG-A24 と同じ所（同じキー）に保存されている。そのまま公開ページに出て、PG-A24 でも見える。移し替えの作業はいらない。

Habitat Oides の枠の一覧（名前・キー・プロジェクト内の画像）は、PG-A24 の「ページごとの枠」を参照。右下のサインは、今も管理画面では変えない（[PG-09 Habitat Oides](../public/09_HabitatOides.md) の「右下のサインを変えるとき」）。

*最終更新: 2026-11-05（画面を廃止し、廃止したことと転送先だけを残した）／2026-11-02（右下のサインを管理画面の枠から外した）／2026-11-02（新規作成）*
