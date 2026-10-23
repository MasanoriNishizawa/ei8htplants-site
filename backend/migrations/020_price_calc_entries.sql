-- 020: 販売価格計算の登録リストのテーブル（price_calc_entries）を作る
--
-- Supabase の SQL Editor で実行する。何度実行しても同じ結果になるように書いている
-- （CREATE TABLE IF NOT EXISTS、ENABLE ROW LEVEL SECURITY、REVOKE / GRANT は繰り返しても同じ）。
--
-- 経緯: 管理画面「販売価格計算」（/admin/price-calc）の登録リストはこのテーブルを読み書きするが、
--       マイグレーションの SQL が無く、本番の Supabase にテーブルが作られていなかった。
--       そのため一覧の読み込み（GET /api/price-calc-entries）が
--       「Could not find the table 'public.price_calc_entries'」で 500 になっていた（2026-10-24 に確認）。
--
-- 前提: サーバー（backend/app/routes/price_calc_entries.py）は service_role のキー（admin_supabase）で
--       読み書きする。フロントから anon キーで直接触らせる必要は無いので、anon・authenticated には権限を付けない。

BEGIN;

-- 1. テーブルを作る（列は backend/app/routes/price_calc_entries.py の EntryBody に合わせる）
CREATE TABLE IF NOT EXISTS price_calc_entries (
    -- 記録の ID（削除のときに使う）
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ブランド（ei8htplants・habitatoides・hue。種類はサーバーでもここでも絞らない）
    brand           TEXT        NOT NULL,
    -- 植物名
    plant_name      TEXT        NOT NULL,
    -- 鉢作家の名前（Habitat Oides で量産鉢のときと、ei8ht plants・HUE の記録は NULL）
    pot_artist_name TEXT,
    -- 元値（円。実生の 1 粒の金額など小数もある）
    cost            NUMERIC     NOT NULL,
    -- 販売価格（円）
    selling_price   NUMERIC     NOT NULL,
    -- 登録した日時（一覧は新しい順に並べる）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 一覧を新しい順に並べるための索引
CREATE INDEX IF NOT EXISTS price_calc_entries_created_at_idx ON price_calc_entries (created_at DESC);

-- 3. RLS を有効にし、anon・authenticated からは読み書きできないようにする
--    （ポリシーを作らないので、RLS を通らない service_role だけが読み書きできる）
ALTER TABLE price_calc_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON price_calc_entries FROM anon, authenticated;

-- 4. サーバー（service_role）に読み書きの権限を付ける
--    （この Supabase プロジェクトでは新しいテーブルに service_role の権限が自動で付かないことがある。018 を参照）
GRANT SELECT, INSERT, DELETE ON price_calc_entries TO service_role;

COMMIT;

-- 5. Supabase の API にテーブルの追加を知らせる
NOTIFY pgrst, 'reload schema';
