# ドキュメント一覧

ei8ht plants 公式サイトの設計ドキュメント。

---

## 要件定義

| ファイル | 内容 |
|---|---|
| [01_requirements.md](01_requirements.md) | 機能要件・非機能要件・制約 |

---

## 基本設計（`basic_design/`）

システムの外部仕様を定義。画面レイアウト・API インターフェース・DB スキーマ・アーキテクチャを記述。

### 共通

| ファイル | 内容 |
|---|---|
| [02_architecture.md](basic_design/02_architecture.md) | 技術スタック・構成図・データフロー・セキュリティ |
| [03_db_design.md](basic_design/03_db_design.md) | Google Sheets シート構成・列定義 |
| [04_api_design.md](basic_design/04_api_design.md) | 残席確認 API・メモ保存 API |
| [05_environment.md](basic_design/05_environment.md) | 環境変数・Gmail OAuth2 手順・Render 設定 |

### 画面設計（`basic_design/screens/`）

#### 公開ページ

| ファイル | 画面 |
|---|---|
| [home.md](basic_design/screens/public/home.md) | ホーム |
| [events.md](basic_design/screens/public/events.md) | イベント一覧 |
| [reserve.md](basic_design/screens/public/reserve.md) | WS予約フォーム |
| [cancel.md](basic_design/screens/public/cancel.md) | キャンセル確認 |
| [contact.md](basic_design/screens/public/contact.md) | お問い合わせ |
| [gallery.md](basic_design/screens/public/gallery.md) | ギャラリー |
| [other_pages.md](basic_design/screens/public/other_pages.md) | About / Brand / Concept |

#### 管理画面

| ファイル | 画面 |
|---|---|
| [login.md](basic_design/screens/admin/login.md) | ログイン |
| [events.md](basic_design/screens/admin/events.md) | イベント管理 |
| [reservations.md](basic_design/screens/admin/reservations.md) | WS予約管理 |
| [reservation_schedule.md](basic_design/screens/admin/reservation_schedule.md) | 予約表（時間帯別） |
| [reservation_history.md](basic_design/screens/admin/reservation_history.md) | 参加履歴 |
| [contacts.md](basic_design/screens/admin/contacts.md) | お問い合わせ一覧 |

### 機能設計（`basic_design/functions/`）

#### 公開機能

| ファイル | 機能 |
|---|---|
| [ws_reservation.md](basic_design/functions/public/ws_reservation.md) | WS予約送信 |
| [ws_cancel.md](basic_design/functions/public/ws_cancel.md) | キャンセル処理 |
| [availability_api.md](basic_design/functions/public/availability_api.md) | 残席確認 API |
| [contact_submit.md](basic_design/functions/public/contact_submit.md) | お問い合わせ送信 |

#### 管理機能

| ファイル | 機能 |
|---|---|
| [event_management.md](basic_design/functions/admin/event_management.md) | イベント管理 CRUD |
| [reservation_management.md](basic_design/functions/admin/reservation_management.md) | 予約管理（一覧・メモ・キャンセル・履歴・予約表） |
| [contact_management.md](basic_design/functions/admin/contact_management.md) | お問い合わせ管理 |

#### 共通機能

| ファイル | 機能 |
|---|---|
| [authentication.md](basic_design/functions/common/authentication.md) | セッション認証 |
| [cache.md](basic_design/functions/common/cache.md) | インメモリ TTL キャッシュ |
| [sheets.md](basic_design/functions/common/sheets.md) | Google Sheets API ラッパー |
| [email.md](basic_design/functions/common/email.md) | Gmail API メール送信 |

---

## 詳細設計（`detailed_design/`）

内部仕様を定義。関数シグネチャ・バリデーションルール・正常系/異常系パターン・シーケンス図・JS 動作詳細を記述。

### 画面詳細設計（`detailed_design/screens/`）

#### 公開ページ

| ファイル | 画面 |
|---|---|
| [home.md](detailed_design/screens/public/home.md) | ホーム |
| [events.md](detailed_design/screens/public/events.md) | イベント一覧 |
| [reserve.md](detailed_design/screens/public/reserve.md) | WS予約フォーム |
| [cancel.md](detailed_design/screens/public/cancel.md) | キャンセル確認 |
| [contact.md](detailed_design/screens/public/contact.md) | お問い合わせ |
| [gallery.md](detailed_design/screens/public/gallery.md) | ギャラリー |

#### 管理画面

| ファイル | 画面 |
|---|---|
| [login.md](detailed_design/screens/admin/login.md) | ログイン |
| [events.md](detailed_design/screens/admin/events.md) | イベント管理 |
| [reservations.md](detailed_design/screens/admin/reservations.md) | WS予約管理 |
| [reservation_schedule.md](detailed_design/screens/admin/reservation_schedule.md) | 予約表（時間帯別） |
| [reservation_history.md](detailed_design/screens/admin/reservation_history.md) | 参加履歴 |
| [contacts.md](detailed_design/screens/admin/contacts.md) | お問い合わせ一覧 |

### 機能詳細設計（`detailed_design/functions/`）

#### 公開機能

| ファイル | 機能 |
|---|---|
| [ws_reservation.md](detailed_design/functions/public/ws_reservation.md) | WS予約送信 |
| [ws_cancel.md](detailed_design/functions/public/ws_cancel.md) | キャンセル処理 |
| [availability_api.md](detailed_design/functions/public/availability_api.md) | 残席確認 API |
| [contact_submit.md](detailed_design/functions/public/contact_submit.md) | お問い合わせ送信 |

#### 管理機能

| ファイル | 機能 |
|---|---|
| [event_management.md](detailed_design/functions/admin/event_management.md) | イベント管理 CRUD |
| [reservation_management.md](detailed_design/functions/admin/reservation_management.md) | 予約管理（一覧・メモ・キャンセル・履歴・予約表） |
| [contact_management.md](detailed_design/functions/admin/contact_management.md) | お問い合わせ管理 |

#### 共通機能

| ファイル | 機能 |
|---|---|
| [authentication.md](detailed_design/functions/common/authentication.md) | セッション認証 |
| [cache.md](detailed_design/functions/common/cache.md) | TTL キャッシュ |
| [sheets.md](detailed_design/functions/common/sheets.md) | Google Sheets API ラッパー（全関数仕様） |
| [email.md](detailed_design/functions/common/email.md) | Gmail API メール送信（全関数仕様） |
