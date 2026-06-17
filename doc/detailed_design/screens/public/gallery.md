# ギャラリー画面 詳細設計書

## 1. 画面概要

| 項目 | 内容 |
|------|------|
| 画面名 | ギャラリー |
| URL | `/gallery`（デフォルト: ei8ht_plants） / `/gallery?brand={brand}` |
| テンプレート | `templates/gallery.html` |
| HTTPメソッド | GET |
| 担当ルート | `app/routes/public.py` → `read_gallery()` |
| 説明 | ブランドごとの写真を一覧表示する。タブ切り替えでブランドを変更できる。画像クリックでライトボックス拡大表示。 |

---

## 2. エンドポイントシグネチャ

```python
@router.get("/gallery", response_class=HTMLResponse)
async def read_gallery(request: Request, brand: str = "ei8ht_plants") -> HTMLResponse
```

### 引数

| 引数 | 型 | 必須 | 説明 |
|------|----|------|------|
| `request` | `Request` | ◯ | FastAPI リクエストオブジェクト |
| `brand` | `str` | ✗ | 表示するブランドのキー。省略時は `"ei8ht_plants"` |

### 有効な brand 値

| brand 値 | 対応ブランド |
|---------|------------|
| `ei8ht_plants` | ei8ht plants（デフォルト） |
| `habitat_oides` | Habitat Oides |
| `hue` | HUE by ei8ht plants |

### 戻り値

| 条件 | 戻り値 | ステータスコード |
|------|--------|----------------|
| 正常 | `TemplateResponse("gallery.html", context)` | 200 |
| 例外発生 | `HTMLResponse(f"Gallery Error: {str(e)}")` | 500 |

---

## 3. テンプレートコンテキスト

| 変数名 | 型 | 説明 |
|--------|-----|------|
| `images` | `list[str]` | 表示する画像の Drive サムネイルURL リスト |
| `current_brand` | `str` | 現在選択中のブランドキー（タブのアクティブ状態判定に使用） |

---

## 4. データ取得詳細

```python
gallery_images = get_gallery_images(brand=brand)
```

- `app/drive.py` の `get_gallery_images(brand: str)` が担当
- Google Drive API でブランドに対応するフォルダの画像ファイルを取得
- 返却される URL は `https://drive.google.com/thumbnail?id={file_id}&sz=w1000` 形式

---

## 5. 画面レイアウト

```
[.page-header]
  <h1>Gallery</h1>

[.gallery-tabs]
  <a href="/gallery?brand=ei8ht_plants"
     class="gallery-tab [active if current_brand == 'ei8ht_plants']">
    ei8ht plants
  </a>
  <a href="/gallery?brand=habitat_oides"
     class="gallery-tab [active if current_brand == 'habitat_oides']">
    Habitat Oides
  </a>
  <a href="/gallery?brand=hue"
     class="gallery-tab [active if current_brand == 'hue']">
    HUE by ei8ht plants
  </a>

[.gallery-container]
  {% if images %}
    [.gallery-grid]  ← CSS Grid: auto-fill, minmax(220px, 1fr), gap: 15px
      {% for img_url in images %}
        [.gallery-item  onclick="openLightbox(img_url)"]  ← 1:1 aspect-ratio
          <img src=img_url  loading="lazy">
      {% endfor %}
  {% else %}
    <p>まだ写真が追加されていません。</p>
  {% endif %}

[#lightbox  .lightbox  onclick="closeLightbox()"]
  <span class="close-btn">×</span>
  <img id="lightbox-img">
```

---

## 6. フロントエンド JS 詳細

### 6-1. openLightbox(src)

```javascript
function openLightbox(src) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = src;
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';  // 背景スクロール無効化
}
```

- トリガー: `.gallery-item` の `onclick` 属性
- `.lightbox` に `.active` クラスを付与（`display: none` → `display: flex`）
- `lightbox-img` の `src` を即座に差し替え

### 6-2. closeLightbox()

```javascript
function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';  // 背景スクロール復元
}
```

- トリガー: ライトボックスオーバーレイのクリック、または ✕ ボタンのクリック

### 6-3. キーボードショートカット

```javascript
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});
```

---

## 7. タブの状態管理

タブのアクティブ状態は Jinja2 テンプレートで静的に決定される（JS による動的切り替えはなし）。

```jinja2
<a href="/gallery?brand=ei8ht_plants"
   class="gallery-tab {% if current_brand == 'ei8ht_plants' %}active{% endif %}">
```

ブランド切り替えは通常のページ遷移（フルリロード）で行われる。

---

## 8. CSS グリッドレイアウト詳細

| ブレークポイント | カラム設定 | ギャップ |
|---------------|-----------|---------|
| PC（> 600px） | `repeat(auto-fill, minmax(220px, 1fr))` | 15px |
| SP（≤ 600px） | `repeat(auto-fill, minmax(140px, 1fr))` | 10px |

各アイテムは `aspect-ratio: 1 / 1` で正方形。`object-fit: cover` で画像をトリミング。

---

## 9. ライトボックスのトランジション詳細

```
[閉じた状態]
  display: none
  opacity: 0

[クリック時]
  .active クラス付与
  display: flex (CSSで設定)
  opacity: transition 0.3s ease でフェードイン

  lightbox-img:
  transform: scale(0.9) → scale(1.0) に transition 0.3s ease
```

---

## 10. 正常系・準正常系・異常系パターン

### 正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| N1 | `/gallery` にアクセス | ei8ht plants のギャラリーが表示される |
| N2 | `?brand=habitat_oides` タブをクリック | Habitat Oides の画像一覧に切り替わる |
| N3 | `?brand=hue` タブをクリック | HUE の画像一覧に切り替わる |
| N4 | 画像をクリック | ライトボックスが開き、画像が拡大表示される |
| N5 | ライトボックス表示中に ✕ ボタンまたはオーバーレイをクリック | ライトボックスが閉じる |
| N6 | ライトボックス表示中に Esc キーを押す | ライトボックスが閉じる |

### 準正常系

| # | 操作 | 期待結果 |
|---|------|---------|
| Q1 | 画像が 0 件のブランドを選択 | "まだ写真が追加されていません。" テキストが表示される |
| Q2 | 存在しない brand 値でアクセス（例: `?brand=other`） | Drive API がそのフォルダを見つけられず空リストを返す → 上記Q1と同様 |

### 異常系

| # | 操作 | 期待結果 |
|---|------|---------|
| E1 | Google Drive API が失敗 | `HTMLResponse("Gallery Error: ...", 500)` |

---

## 11. シーケンス図

```
ブラウザ                    FastAPI                    Google Drive API
  |                           |                              |
  |--- GET /gallery?brand=... ->|                             |
  |                           |-- get_gallery_images(brand) ->|
  |                           |   ブランドフォルダの画像一覧取得|
  |                           |<-- list[str] (thumbnail URL) -|
  |                           |                              |
  |<-- 200 HTML (gallery.html)|                              |

  ※ 画像クリック時（ライトボックス）
  ブラウザ内 JS でのみ処理。サーバーへのリクエストなし。
  lightbox-img.src にクリックした画像のURLを設定して表示。
```

---

## 12. エラーハンドリング詳細

| 発生箇所 | 例外 | 処理 |
|---------|------|------|
| `get_gallery_images()` 失敗 | `googleapiclient.errors.HttpError` など | `except Exception` でキャッチ → `HTMLResponse("Gallery Error: ...", 500)` |
| 画像のロード失敗（クライアント側） | ネットワークエラーなど | `loading="lazy"` の標準動作（ブラウザが空アイコン表示）。JS による代替処理なし |
