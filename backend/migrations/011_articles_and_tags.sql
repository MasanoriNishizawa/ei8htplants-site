-- 記事（ジャーナル）テーブル
CREATE TABLE articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  content      TEXT,
  image_urls   TEXT[]    NOT NULL DEFAULT '{}',
  tags         TEXT[]    NOT NULL DEFAULT '{}',
  is_published BOOLEAN   NOT NULL DEFAULT false,
  display_order INTEGER  NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 商品タグ追加
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
