-- カテゴリーカラムを products テーブルに追加

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
