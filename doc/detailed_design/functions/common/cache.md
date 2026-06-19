# 詳細設計書：TTL インメモリキャッシュ（共通）

**モジュール**: `app/cache.py`  
**依存モジュール**: `time`（標準ライブラリ）、`typing`

---

## 1. 概要

Google Sheets / Drive API の無料枠レートリミット（100 リクエスト/100 秒）への対策として、  
同一データの繰り返し取得を防ぐシンプルなインメモリ TTL キャッシュ。

- 実装方式: Python 辞書をラップした `TTLCache` クラス
- スコープ: プロセス内グローバル（サーバー再起動でリセット）
- スケール前提: シングルプロセス（Render 無料プラン相当）

---

## 2. 内部データ構造

```python
_store: dict[str, tuple[Any, float]]
```

| フィールド | 型 | 説明 |
|---|---|---|
| キー | `str` | キャッシュキー（例: `"events:current"`） |
| 値[0] | `Any` | キャッシュされたデータ本体 |
| 値[1] | `float` | 有効期限（`time.monotonic()` の絶対値） |

**`time.monotonic()` を使う理由**:  
`time.time()` はシステムクロックの NTP 同期等で前後する可能性があるが、  
`time.monotonic()` は単調増加が保証されており TTL 計算に適している。  
ただし、プロセス再起動で値がリセットされるため、プロセス間での時刻比較には使えない。

---

## 3. クラス仕様

### 3.1 `TTLCache`

```python
class TTLCache:
    def __init__(self, ttl: int = 300)
```

#### コンストラクタ引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `ttl` | `int` | `300` | デフォルト有効期間（秒）。個別の `set()` で上書き可能 |

---

### 3.2 `get`

```python
def get(self, key: str) -> Optional[Any]
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `key` | `str` | 取得するキャッシュキー |

#### 戻り値

| 値 | 条件 |
|---|---|
| キャッシュされた値 | キーが存在し、`time.monotonic() < 有効期限タイムスタンプ` |
| `None` | キーが存在しない、または有効期限切れ |

#### 内部ロジック

```python
entry = self._store.get(key)
if entry and time.monotonic() < entry[1]:
    return entry[0]
self._store.pop(key, None)  # 期限切れエントリのメモリを解放
return None
```

#### 条件分岐

| パターン | キー存在 | 有効期限 | 戻り値 | 副作用 |
|---|---|---|---|---|
| キャッシュヒット | あり | 未到来 | キャッシュ値 | なし |
| キャッシュミス（期限切れ） | あり | 到来済み | `None` | `_store` からキー削除（遅延クリーンアップ） |
| キャッシュミス（キー不存在） | なし | - | `None` | なし |

**遅延クリーンアップ**: 期限切れエントリはアクセス時にのみ削除される。  
アクセスされないエントリはメモリに残り続けるが、イベントデータ数は少ないため問題にならない。  
将来データ量が増加した場合はバックグラウンドでのスキャンを検討すること。

#### 例外

なし（`dict.get()` と `dict.pop()` は例外を投げない）。

---

### 3.3 `get_stale`

```python
def get_stale(self, key: str) -> Optional[Any]
```

#### 概要

TTL が切れていても値を返す。Google API が一時的なエラーを返した際のフォールバック専用メソッド。

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `key` | `str` | 取得するキャッシュキー |

#### 戻り値

| 値 | 条件 |
|---|---|
| キャッシュされた値 | キーが存在する（有効期限を問わない） |
| `None` | キーが存在しない |

#### 内部ロジック

```python
entry = self._store.get(key)
return entry[0] if entry else None
```

#### `get` との違い

| メソッド | 有効期限切れ時 | 副作用 |
|---|---|---|
| `get` | `None` を返し、エントリを削除 | 期限切れエントリをクリーンアップ |
| `get_stale` | 期限切れ値を返す | なし（`_store` 不変） |

#### 使用パターン（API エラーフォールバック）

```python
try:
    data = api_call()           # 正常パス
    cache.set(key, data)
    return data
except Exception:
    logger.warning("API error, returning stale cache")
    return cache.get_stale(key) or []   # フォールバック
```

3 段階フォールバック:
1. `cache.get(key)` がヒット → 有効なキャッシュを返す（通常パス）
2. API エラー → `cache.get_stale(key)` で期限切れの古いデータを返す
3. キャッシュが一度も作られていない → `[]` を返す（空表示）

#### 例外

なし。

---

### 3.4 `set`

```python
def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None
```

#### 引数

| 引数名 | 型 | デフォルト | 説明 |
|---|---|---|---|
| `key` | `str` | 必須 | キャッシュキー |
| `value` | `Any` | 必須 | キャッシュする値（参照が保存されるため、可変オブジェクトの変更が意図せず反映される点に注意） |
| `ttl` | `Optional[int]` | `None` | 有効期間（秒）。`None` の場合はインスタンスのデフォルト TTL を使用 |

#### 内部ロジック

```python
self._store[key] = (value, time.monotonic() + (ttl or self._ttl))
```

#### 条件分岐

| パターン | `ttl` 引数 | 有効期限の計算 |
|---|---|---|
| デフォルト TTL 使用 | `None` または `0` | `time.monotonic() + self._ttl`（300 秒） |
| 個別 TTL 指定 | 正の整数 | `time.monotonic() + ttl` |

**注意**: `ttl=0` は `ttl or self._ttl` で `self._ttl` が使われる（0 は falsy）。  
即時失効させたい場合は `delete()` を使うこと。

#### 副作用

既存のキーがある場合は上書きされる（古い有効期限タイムスタンプも置き換わる）。

#### 例外

なし。

---

### 3.4 `delete`

```python
def delete(self, key: str) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `key` | `str` | 削除するキャッシュキー |

#### 内部ロジック

```python
self._store.pop(key, None)
```

#### 条件分岐

| パターン | 結果 |
|---|---|
| キーが存在する | エントリを即時削除 |
| キーが存在しない | 何もしない（`pop(key, None)` のデフォルト値で `KeyError` を防ぐ） |

#### 例外

なし。

---

### 3.5 `clear_prefix`

```python
def clear_prefix(self, prefix: str) -> None
```

#### 引数

| 引数名 | 型 | 説明 |
|---|---|---|
| `prefix` | `str` | 削除対象キーのプレフィックス（例: `"events:"`） |

#### 内部ロジック

```python
for k in [k for k in self._store if k.startswith(prefix)]:
    del self._store[k]
```

**リスト内包表記で先にキーをコピーする理由**:  
`for k in self._store` でイテレーション中に `del self._store[k]` を実行すると  
`RuntimeError: dictionary changed size during iteration` が発生するため、  
先にキーのリストを作成してからループする。

#### 条件分岐

| パターン | 結果 |
|---|---|
| マッチするキーが存在する | 該当するすべてのキーを一括削除 |
| マッチするキーが存在しない | 何もしない |

#### 使用例

```python
# イベントデータ書き込み後に公開ページキャッシュを全無効化
cache.clear_prefix("events:")
# → "events:current" と "events:past" の両方が削除される
```

#### 例外

なし。

---

## 4. モジュールレベルシングルトン

```python
cache = TTLCache(ttl=300)  # デフォルト TTL: 5分
```

アプリ全体で `from .cache import cache` としてインポートして使用する。  
モジュールは Python のインポートシステムによって 1 回だけロードされるため、  
プロセス内でシングルトンとして機能する。

---

## 5. キャッシュキー一覧

| キャッシュキー | TTL | セット箇所 | 無効化箇所 | 格納データ |
|---|---|---|---|---|
| `events:current` | 5分（デフォルト） | `sheets.get_events_data(is_past=False)` | `sheets.create_event` / `update_event` / `delete_event` | 現在・将来のイベントリスト |
| `events:past` | 5分（デフォルト） | `sheets.get_events_data(is_past=True)` | 同上 | 過去のイベントリスト |
| `gallery:<brand>` | 10分（`ttl=600` 指定） | `drive.get_gallery_images()` | なし（TTL 切れ待ち） | Drive フォルダ内の画像 URL リスト |
| `home_gallery` | 10分（`ttl=600` 指定） | `drive.get_home_gallery()` | なし（TTL 切れ待ち） | ホーム用ギャラリー画像 URL リスト |

---

## 6. スレッドセーフ性

- Python の CPython 実装では GIL（Global Interpreter Lock）により、  
  `dict` への単純な代入・削除は原子的に実行される。
- ただし `clear_prefix()` のようなリスト内包表記 → ループの複合操作は  
  スレッド間で中間状態を見る可能性がある（二重削除は `pop(key, None)` で安全だが、  
  新しいキーの追加が `clear_prefix` のスキャン後に起き、削除漏れが生じる可能性がある）。
- Render の無料プランはシングルプロセスシングルスレッド（uvicorn 1 ワーカー）であるため  
  実質的に競合は発生しない。マルチワーカー構成に移行する場合は Redis 等に置き換えること。

---

## 7. 制約・将来対応

| 制約 | 内容 |
|---|---|
| プロセス間共有不可 | 複数 uvicorn ワーカーや複数サーバーへのスケール時は Redis 等が必要 |
| 永続化なし | サーバー再起動（Render の Cold Start 含む）でキャッシュがリセットされる |
| 定期スキャンなし | アクセスされない期限切れエントリはメモリに残り続ける |
| スレッドセーフ保証なし | マルチスレッド環境では `threading.Lock` の追加を検討 |
