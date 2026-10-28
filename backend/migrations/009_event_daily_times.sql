-- イベントに日ごとの開催時間をJSON形式で保存する列を追加する。
-- 既存テーブルにも適用できるよう、同名列がある場合は追加を省略する。
ALTER TABLE events ADD COLUMN IF NOT EXISTS daily_times jsonb;
