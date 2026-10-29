-- ジャーナル記事の本文・画像・タグ・掲載順・公開状態を保存する。
-- is_published が false の下書きは公開ページには出さず、published_at は公開日時を記録する。
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

-- 商品を記事と同じタグで分類・検索できるよう、商品側にもタグ配列を追加する。
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
