# ホーム画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | ホーム（トップページ） |
| URL | `/` |
| テンプレート | `templates/home.html` |
| HTTPメソッド | GET |
| 担当ルート | `app/routes/public.py` → `read_home()` |
| 説明 | サイトのエントリーポイント。3ブランドのロゴをクロスフェードするヒーロースライダー、直近イベントのプレビュー、ギャラリーマーキー、Instagramリンクを表示する。 |

---

## 2. エンドポイントシグネチャ

```python
@router.get("/", response_class=HTMLResponse)
async def read_home(request: Request) -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常 | `TemplateResponse("home.html", context)` | 200 |
| 例外発生 | `HTMLResponse(f"Home Error: {str(e)}")` | 500 |

---

## 3. テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `next_event` | `dict \| None` | 開催予定イベントの先頭1件（`get_events_data(is_past=False)` の `[0]`）。イベントがなければ None |
| `gallery_images` | `list[str]` | ホーム用ギャラリー画像URL のリスト（`get_home_gallery_images()` で取得）。Drive サムネイルURL 形式 |

---

## 4. データ取得詳細

### next_event の取得

```python
active_events = get_events_data(is_past=False)
next_event = active_events[0] if active_events else None
```

- `get_events_data(is_past=False)` は `"events:current"` キャッシュを使用
- 返却データは `_enrich_event()` 済み（`display_date`, `map_url`, `image_urls`, `_row` を含む）
- ソート: start_obj 昇順（最も近い日付が先頭）

### gallery_images の取得

```python
gallery_images = get_home_gallery_images()
```

- `app/drive.py` の `get_home_gallery_images()` が担当
- 全ブランドのフォルダから最大 8 枚ずつランダムに並べた画像URLリストを返す
- Drive API を使用（Google Drive フォルダの一覧取得）

---

## 5. 画面レイアウト

```
[.home-hero]  ← ヒーローセクション
  [.hero-slider]  ← 3枚のロゴ画像クロスフェード
    img#1  ei8ht plants ロゴ    (animation-delay: 0s,  scale: 1.4)
    img#2  Habitat Oides ロゴ   (animation-delay: 4s,  scale: 1.0)
    img#3  HUE ロゴ             (animation-delay: 8s,  scale: 1.15)
  [.home-subtitle]  "Agave / Habitat Style / Color Plants"

[.container]

  [最大幅ラッパー]
    {% if next_event %}
      <h2>NEXT EVENT</h2>
      [.home-next-wrapper]
        create_event_card(next_event, is_next=True, is_home=True)
        ← PC: 横並び（画像35% + テキスト65%）
        ← SP: 縦積み
      [.nav-grid]
        <a href="/events">VIEW ALL EVENTS</a>
    {% endif %}

  [最大幅ラッパー]
    <h2>GALLERY</h2>

  {% if gallery_images %}
  [.marquee-section]  ← 無限スクロールマーキー（マスク付き）
    [.marquee-content]  ← CSS animation: marquee 80s linear infinite
      {% for img_url in gallery_images %}
        [.marquee-item]  250×250px（SP: 150×150px）
          <img loading="lazy">
      {% endfor %}
      （同じリストをもう1セット追加して無限ループを実現）
  [.nav-grid]
    <a href="/gallery">VIEW ALL GALLERY</a>
  {% endif %}

  [.ig-section]  ← Instagram リンク
    "Instagram" ラベル
    [.ig-grid]  3ブランドのロゴ画像リンク
      a href="https://www.instagram.com/habitatoides/"
        img  Habitat Oides ロゴ（.ig-img-habitat: 丸形、border-radius: 20%）
      a href="https://www.instagram.com/ei8ht.plants/"
        img  ei8ht plants ロゴ（.ig-img-ei8ht: 140%幅）
      a href="https://www.instagram.com/hue_by.ei8ht.plants/"
        img  HUE ロゴ（.ig-img-hue: 115%幅）
```

---

## 6. ヒーロースライダーのアニメーション詳細

### CSSアニメーション定義

```css
@keyframes hero-fade {
  0%   { opacity: 0; }
  8%   { opacity: 1; }   /* フェードイン完了 */
  25%  { opacity: 1; }   /* 表示維持 */
  33%  { opacity: 0; }   /* フェードアウト完了 */
  100% { opacity: 0; }   /* 非表示維持 */
}
```

- アニメーション周期: 12秒
- 各スライドの開始タイミング: 0s / 4s / 8s（12s / 3枚 = 4s間隔）
- 同時に opacity > 0 になる可能性がある遷移期間: 約 0.96秒（8% × 12s）
- 各スライドの個別スケール:
  - ei8ht plants: `scale(1.4)` ← ロゴサイズが小さいため拡大
  - Habitat Oides: `scale(1.0)` ← デフォルト
  - HUE: `scale(1.15)` ← やや拡大

---

## 7. マーキーアニメーション詳細

```css
@keyframes marquee {
  0%   { transform: translateX(0); }
  100% { transform: translateX(calc(-50% - 7.5px)); }
}
/* アニメーション時間: 80秒 / SP: calc(-50% - 5px) */
```

- 画像リストを2セット並べて、-50%（1セット分）スクロールした時点でリセット → 無限ループ
- SP（600px以下）: アイテム幅 150px、マージン 10px に合わせて offset 調整

---

## 8. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | `/` にアクセス（開催予定イベントあり） | ヒーロー + NEXT EVENT カード + マーキー + Instagram が表示される |
| N2 | `/` にアクセス（ギャラリー画像あり） | マーキーセクションが表示される |
| N3 | NEXT EVENT の「予約する」ボタン（WSフラグ=TRUE）をクリック | `/reserve?row=N` に遷移 |
| N4 | 「VIEW ALL EVENTS」ボタンをクリック | `/events` に遷移 |
| N5 | 「VIEW ALL GALLERY」ボタンをクリック | `/gallery` に遷移 |
| N6 | Instagram リンクをクリック | 新しいタブで Instagram ページが開く |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | 開催予定イベントが 0 件 | NEXT EVENT セクションと「VIEW ALL EVENTS」ボタンが非表示 |
| Q2 | ギャラリー画像が 0 件 | マーキーセクションと「VIEW ALL GALLERY」ボタンが非表示 |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | Google Sheets API が失敗 | `HTMLResponse("Home Error: ...", 500)` |
| E2 | Google Drive API が失敗 | `HTMLResponse("Home Error: ...", 500)` |

---

## 9. シーケンス図

```
ブラウザ                    FastAPI                    Cache / Sheets / Drive
  |                           |                              |
  |--- GET / --------------->|                              |
  |                           |-- get_events_data(False) --->|
  |                           |   (cache: "events:current")  |
  |                           |   キャッシュヒット時: リスト返却|
  |                           |   キャッシュミス時: Sheets API呼び出し + 保存
  |                           |<-- active_events ------------|
  |                           |                              |
  |                           |-- get_home_gallery_images() ->|
  |                           |   (Drive API でフォルダ一覧取得)
  |                           |<-- gallery_images list -------|
  |                           |                              |
  |<-- 200 HTML (home.html)   |                              |
```

---

## 10. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_events_data()` 失敗 | `gspread.exceptions.APIError` など | `except Exception` → `HTMLResponse("Home Error: ...", 500)` |
| `get_home_gallery_images()` 失敗 | Google Drive API エラー | `except Exception` → `HTMLResponse("Home Error: ...", 500)` |

---

## 11. Instagram ロゴ画像 URL

画像は Google Drive から直接取得（Drive File ID ハードコード）:

| ブランド | Drive File ID | CSS クラス |
|---------|--------------|-----------|
| ei8ht plants | `1moQXoFi1LMc_2QXqlL66B9FSg6oNsIAY` | `.ig-img-ei8ht` (140%幅) |
| Habitat Oides | `1LKGtMjURROL6xkNpW7esWzXA25qrYj7-` | `.ig-img-habitat` (border-radius: 20%) |
| HUE by ei8ht plants | `1IBoYiugKRW5eWJcccOy_Jot5mJMOjygl` | `.ig-img-hue` (115%幅) |

ヒーロースライダーも同じ Drive File ID を使用（`?sz=w1000` パラメータ付き）。
