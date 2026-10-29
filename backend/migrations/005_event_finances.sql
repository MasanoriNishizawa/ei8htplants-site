-- イベントごとの売上・出店費用・移動費・その他支出を保存し、管理画面の収支集計に使う。
CREATE TABLE event_finances (
  -- 収支レコードの一意なID。
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 収支を集計するイベント。イベント削除時は関連する収支も削除する。
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- イベント全体の売上（円）。
  sales integer NOT NULL DEFAULT 0,
  -- 出店料（円）。
  booth_fee integer NOT NULL DEFAULT 0,
  -- 会場までの片道距離（km）。交通費計算では往復距離として扱う。
  distance integer NOT NULL DEFAULT 0,
  -- ガソリン単価（円/リットル）。片道距離と燃費から交通費を算出する。
  gas_price integer NOT NULL DEFAULT 170,
  -- 高速道路料金（円）。
  expressway_toll integer NOT NULL DEFAULT 0,
  -- イベント参加に伴う宿泊費（円）。
  accommodation integer NOT NULL DEFAULT 0,
  -- ワークショップ参加人数。売上・材料費の計算に使う。
  ws_participants integer NOT NULL DEFAULT 0,
  -- 手伝いへの支払い計算の対象にするかを示すフラグ。
  payment_flag boolean NOT NULL DEFAULT false,
  -- 出店料・交通費・宿泊費以外に発生した支出（円）。
  other_expenses integer NOT NULL DEFAULT 0,
  -- その他支出の内訳・用途のメモ。
  other_expenses_note text,
  -- 収支に関する自由記入の備考。
  notes text,
  -- この収支レコードを最後に更新した日時。
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 1イベントにつき収支レコードは1件に制限する。
  UNIQUE(event_id)
);

ALTER TABLE event_finances ENABLE ROW LEVEL SECURITY;
-- 収支データの読み書きはバックエンドのサービスロールに限定する。
CREATE POLICY "service_role_all" ON event_finances FOR ALL TO service_role USING (true);
