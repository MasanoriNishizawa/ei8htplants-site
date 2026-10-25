-- 021: 販売価格計算の登録リスト（price_calc_entries）に「種類」（生産・仕入れ）の列を足す
--
-- Supabase の SQL Editor で実行する。何度実行しても同じ結果になるように書いている
-- （ADD COLUMN IF NOT EXISTS、DROP CONSTRAINT IF EXISTS のあとに ADD CONSTRAINT）。
--
-- 経緯: 2026-10-25 に販売価格計算へ「生産」「仕入れ」のタブを付けた。登録リストで
--       どちらの計算で登録したかを見分けられるよう、種類を保存する。
--       元値（cost）の意味も種類で変わる（生産なら卸価格、仕入れなら仕入れ値）。
--
-- 前提: 020_price_calc_entries.sql を実行済みであること。権限は 020 で付けたものがそのまま使える。

BEGIN;

-- 1. 種類の列を足す（production = 生産、purchase = 仕入れ。この列ができる前の記録は NULL のまま）
ALTER TABLE price_calc_entries ADD COLUMN IF NOT EXISTS mode TEXT;

-- 2. 入れられる値を production・purchase（と NULL）に絞る
ALTER TABLE price_calc_entries DROP CONSTRAINT IF EXISTS price_calc_entries_mode_check;
ALTER TABLE price_calc_entries ADD CONSTRAINT price_calc_entries_mode_check
    CHECK (mode IN ('production', 'purchase'));

COMMIT;

-- 3. Supabase の API に列の追加を知らせる
NOTIFY pgrst, 'reload schema';
