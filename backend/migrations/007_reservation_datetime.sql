-- ワークショップ予約に希望日と希望時間を保存する列を追加する。
-- 既存テーブルにも適用できるよう、同名列がある場合は追加を省略する。
ALTER TABLE workshop_reservations
  ADD COLUMN IF NOT EXISTS preferred_date text,
  ADD COLUMN IF NOT EXISTS preferred_time text;
