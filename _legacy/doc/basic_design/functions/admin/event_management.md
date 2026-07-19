# 機能設計：イベント管理 CRUD

## 概要

管理画面からイベントシート（シート0）を作成・更新・削除する機能。  
書き込み後はキャッシュを無効化して公開ページに即反映する。

---

## 作成（`POST /admin/events/new`）

```
_parse_event_form(request)
  → form.getlist("販売ブランド") → ", ".join()
  → WSフラグ: form.get("WSフラグ") → "TRUE" / "FALSE"
  ↓
create_event(data)
  → ws.append_row([...12列...])
  → cache.clear_prefix("events:")   ← 公開ページキャッシュ無効化
  ↓
session["flash"] = "イベントを作成しました"
302 Redirect /admin/events
```

---

## 更新（`POST /admin/events/{row}`）

```
update_event(row, data)
  → ws.update(row, [値リスト])      ← 指定行を1行まるごと上書き
  → cache.clear_prefix("events:")
```

---

## 削除（`POST /admin/events/{row}/delete`）

```
delete_event(row)
  → ws.delete_rows(row)
  → cache.clear_prefix("events:")
```

- GET ではなく POST にしている理由: ブラウザの先読みや誤クリックによる意図しない削除を防ぐ
- テンプレート側でも `confirm()` による二重確認あり

---

## フラッシュメッセージの仕組み

```python
# 書き込み後に設定
session["flash"] = "イベントを作成しました"

# 一覧ページで1回だけ読み出し（読み出し後は削除）
flash = request.session.pop("flash", None)
```
