# FT-02 — APIクライアント

## 概要

`frontend/src/lib/api.ts` に定義された、バックエンドAPI呼び出し共通ヘルパーと TypeScript 型定義。全ページ・全Admin画面から参照する。

## 使用ページ

全ページ（公開・Admin共通）

## 実装ファイル

`frontend/src/lib/api.ts`

## コアヘルパー

```ts
async function request<T>(path: string, options?: RequestInit): Promise<T>
```

- ベースURL `/api` にパスを結合してfetch
- `Content-Type: application/json` をデフォルトヘッダーに付与
- レスポンスが `!res.ok` の場合 `Error` をスロー
- `res.json()` の結果を型 `T` として返す

## エクスポートオブジェクト `api`

| namespace | メソッド | HTTPメソッド | パス |
|---|---|---|---|
| `api.events` | `list(past)` | GET | `/events?past=` |
| `api.events` | `get(id)` | GET | `/events/{id}` |
| `api.gallery` | `list(brand?)` | GET | `/gallery?brand=` |
| `api.stockists` | `list()` | GET | `/stockists` |
| `api.stockists` | `patch(id, body)` | PATCH | `/stockists/{id}` |
| `api.contact` | `send(body)` | POST | `/contact` |
| `api.contact` | `list()` | GET | `/contacts` |
| `api.contact` | `markRead(id, is_read)` | PATCH | `/contacts/{id}` |
| `api.reserve` | `create(body)` | POST | `/reserve` |
| `api.reserve` | `list()` | GET | `/reserves` |
| `api.reserve` | `updateStatus(id, status)` | PATCH | `/reserves/{id}` |
| `api.collaborations` | `list()` | GET | `/collaborations` |
| `api.collaborations` | `add(body)` | POST | `/collaborations` |
| `api.collaborations` | `delete(id)` | DELETE | `/collaborations/{id}` |

## 型定義

| 型名 | 用途 |
|---|---|
| `Event` | イベント（images 配列含む） |
| `GalleryImage` | ギャラリー画像（brand フィールド含む） |
| `Stockist` | 取扱店（brands[] フィールド含む） |
| `StockistBody` | 取扱店 作成・更新ペイロード |
| `ContactPayload` | お問い合わせ送信ペイロード |
| `ContactRecord` | お問い合わせDBレコード（is_read含む） |
| `ReservationPayload` | 予約作成ペイロード |
| `Reservation` | 予約DBレコード（status含む） |
| `Collaboration` | コラボレーション記事 |
| `CollaborationPayload` | コラボレーション作成ペイロード |

## エラーハンドリング方針

- `request` 関数はステータスコード異常時に `Error` をスローする
- 呼び出し元ページで `try/catch` または `.catch()` により個別に処理する
- Homeページなど副次的なデータ取得は `.catch(() => {})` で無視
