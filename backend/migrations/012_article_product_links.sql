-- 記事に関連商品IDを紐付けるカラム
ALTER TABLE articles ADD COLUMN IF NOT EXISTS product_ids uuid[] DEFAULT '{}';

-- 記事の作成・更新などの管理操作はバックエンドに許可する。
GRANT ALL ON articles TO service_role;
-- 公開サイトは記事を読み取れる。公開・下書きの行制限は019のRLSポリシーで行う。
GRANT SELECT ON articles TO anon;
