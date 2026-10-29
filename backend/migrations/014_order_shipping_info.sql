-- 注文テーブルに配送会社・追跡番号カラムを追加
-- carrier は配送に使った会社名、tracking_number は配送状況確認用の追跡番号を保存する。
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
