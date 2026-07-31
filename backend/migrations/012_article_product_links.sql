-- 記事に関連商品IDを紐付けるカラム
ALTER TABLE articles ADD COLUMN IF NOT EXISTS product_ids uuid[] DEFAULT '{}';

GRANT ALL ON articles TO service_role;
GRANT SELECT ON articles TO anon;
