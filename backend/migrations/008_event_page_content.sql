-- イベントごとの公開ページ本文（JSON形式）を保存する列を追加する。
-- 既存テーブルにも適用できるよう、同名列がある場合は追加を省略する。
ALTER TABLE events ADD COLUMN IF NOT EXISTS page_content jsonb;
