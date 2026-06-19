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
    def get_stale(self, key) → Any | None:
        # TTL 切れでも値を返す（API エラー時のフォールバック専用）
    def set(self, key, value, ttl=None):
        # (value, 有効期限) のタプルで保存
    def clear_prefix(self, prefix):
        # プレフィックス一致する全キーを削除
        # 例: cache.clear_prefix("events:") で
        #     "events:current" と "events:past" を一括無効化

cache = TTLCache(ttl=300)  # モジュールレベルのシングルトン
```

### API エラー時のフォールバック戦略

Google Drive / Sheets API が 503 などの一時的エラーを返した場合:

1. `cache.get()` でキャッシュが有効なら → そのまま返す（通常パス）
2. API 呼び出しが失敗したら → `cache.get_stale()` で期限切れの古いデータを返す
3. キャッシュが一度も作られていなければ → `[]` を返す（空表示）

これにより 503 エラーがユーザーに見えるエラー画面になることを防ぐ。

---

## 制約

- シングルプロセス前提。複数インスタンスへのスケールには Redis 等が必要
- Render の無料プランはシングルプロセスのため問題なし
