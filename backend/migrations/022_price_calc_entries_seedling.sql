-- 022: 販売価格計算の登録リスト（price_calc_entries）の種類（mode）に「実生」（seedling）を足す
--
-- Supabase の SQL Editor で実行する。何度実行しても同じ結果になるように書いている
-- （DROP CONSTRAINT IF EXISTS のあとに ADD CONSTRAINT）。
--
-- 経緯: 2026-10-25 に ei8ht plants・Habitat Oides の販売価格計算へ「実生」のタブを戻した。
--       021 で付けた制約は production・purchase だけを許すので、seedling を足す。
--
-- 前提: 020・021 を実行済みであること。新しいプログラムは実生の登録で mode = 'seedling' を送るので、
--       この SQL はデプロイの前に実行する（実行しないと実生の登録が失敗する）。

BEGIN;

-- 1. 種類に入れられる値を production（生産）・purchase（仕入れ）・seedling（実生）（と NULL）にする
ALTER TABLE price_calc_entries DROP CONSTRAINT IF EXISTS price_calc_entries_mode_check;
ALTER TABLE price_calc_entries ADD CONSTRAINT price_calc_entries_mode_check
    CHECK (mode IN ('production', 'purchase', 'seedling'));

COMMIT;

-- 2. Supabase の API に制約の変更を知らせる
NOTIFY pgrst, 'reload schema';
