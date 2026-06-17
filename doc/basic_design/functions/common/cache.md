# 機能設計：インメモリ TTL キャッシュ（共通）

## 概要

Google Sheets / Drive API のレートリミット対策。  
`app/cache.py` に実装。サーバー再起動でリセットされる。

---

## キャッシュ設定

| キャッシュキー | TTL | 無効化タイミング |
|---|---|---|
| `events:current` | 5分 | イベント作成・更新・削除時 |
| `events:past` | 5分 | 同上 |
| `gallery:<brand>` | 10分 | 手動なし（TTL 切れ待ち） |
| `home_gallery` | 10分 | 同上 |

---

## 実装

```python
class TTLCache:
    def get(self, key) → Any | None:
        # 期限切れなら None を返してエントリ削除
    def set(self, key, value, ttl=None):
        # (value, 有効期限) のタプルで保存
    def clear_prefix(self, prefix):
        # プレフィックス一致する全キーを削除
        # 例: cache.clear_prefix("events:") で
        #     "events:current" と "events:past" を一括無効化

cache = TTLCache(ttl=300)  # モジュールレベルのシングルトン
```

---

## 制約

- シングルプロセス前提。複数インスタンスへのスケールには Redis 等が必要
- Render の無料プランはシングルプロセスのため問題なし
