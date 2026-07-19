# 画面設計：ギャラリー

## 基本情報

| 項目 | 値 |
|---|---|
| URL | `/gallery?brand=ei8ht_plants` |
| テンプレート | `templates/gallery.html` |
| 認証 | 不要 |

---

## レイアウト

```
┌─────────────────────────────────┐
│  [ei8ht plants] [habitat oides] [hue] タブ切り替え
├─────────────────────────────────┤
│  画像グリッド                    │
│  [img] [img] [img]              │
│  [img] [img] [img]              │
└─────────────────────────────────┘
```

---

## クエリパラメータ

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `brand` | `ei8ht_plants` | `ei8ht_plants` / `habitat_oides` / `hue` |

---

## 画像取得

Google Drive フォルダ（`FOLDERS` 定数）からブランド別に全画像を取得。  
Drive サムネイル API（`sz=w1000`）経由でブラウザに直接表示。  
TTL 10分のキャッシュ使用。
