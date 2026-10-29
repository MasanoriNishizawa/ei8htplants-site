-- 商品一覧で分類・絞り込みに使う任意のカテゴリーを products に追加する。
-- 既存商品の未分類状態を許容するため NULL を認め、登録値は下記のカテゴリ一覧に制限する。

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IS NULL OR category IN (
      'アガベ',
      '塊根植物',
      '灌木',
      'サボテン',
      '観葉植物',
      'ハビタットスタイル',
      'ハビタットスタイル資材',
      '園芸資材',
      '鉢'
    ));
