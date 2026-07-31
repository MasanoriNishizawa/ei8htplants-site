-- 注文テーブルに配送会社・追跡番号カラムを追加
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number text;
