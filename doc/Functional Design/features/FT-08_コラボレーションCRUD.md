# FT-08 — コラボレーションCRUD

## 概要

コラボレーション記事の一覧取得・追加・削除機能。公開ページでは読み取りのみ、Adminページで管理操作を行う。

## 使用ページ

| ページID | ページ名 | 操作 |
|---|---|---|
| [PG-07](../pages/public/PG-07_Collaborations.md) | Collaborations（公開） | 一覧取得（読み取り） |
| [PG-A06](../pages/admin/PG-A06_Collaborations.md) | コラボレーション管理（Admin） | 一覧取得・追加・削除 |

## 実装ファイル

- `frontend/src/pages/Collaborations.tsx`
- `frontend/src/pages/admin/Collaborations.tsx`
- `backend/app/routes/collaborations.py`

## API

| 操作 | メソッド | パス | 認証 |
|---|---|---|---|
| 一覧取得 | GET | `/api/collaborations` | 不要（anon読み取り可） |
| 追加 | POST | `/api/collaborations` | service_role（バックエンド） |
| 削除 | DELETE | `/api/collaborations/{id}` | service_role（バックエンド） |

## データモデル

```ts
interface Collaboration {
  id: string
  title: string
  partner_name: string | null
  description: string | null
  video_url: string | null
  image_url: string | null
  event_date: string | null   // ISO date string
  display_order: number
  created_at: string
}
```

## Admin フォーム

| フィールド | 必須 | 説明 |
|---|---|---|
| title | ○ | タイトル |
| partner_name | — | コラボ相手 |
| event_date | — | 開催日（type="date"） |
| video_url | — | 動画URL |
| image_url | — | 画像URL |
| description | — | 説明文（textarea） |

## 追加フロー

```
フォーム送信
    │
    ▼
api.collaborations.add(payload)    （POST /api/collaborations）
    │
    ▼
display_order = 現在の件数でDB INSERT
    │
    ▼
load() で一覧を再取得 → state 更新
フォームをリセット
```

## 削除フロー

```
削除ボタンクリック
    │
    ▼
confirm('削除しますか？')
    │
    ├─ OK ──→ api.collaborations.delete(id)    （DELETE /api/collaborations/{id}）
    │              ▼
    │          load() で一覧を再取得
    └─ キャンセル ──→ 何もしない
```

## 公開ページの表示

- `image_url` がある場合：16:9アスペクト比で画像表示
- `image_url` がなく `video_url` がある場合：autoplay/loop/muted の video 表示
- `partner_name`・`event_date`・`description` は存在する場合のみ表示
