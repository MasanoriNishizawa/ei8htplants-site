-- Supabase SQLエディターで実行する管理機能用のテーブル・カラム追加SQL。

-- 1. コラボレーション情報を保存し、公開読み取りとサービスロールによる管理を許可する。
CREATE TABLE IF NOT EXISTS collaborations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  partner_name TEXT,
  description TEXT,
  video_url TEXT,
  image_url TEXT,
  event_date DATE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE collaborations ENABLE ROW LEVEL SECURITY;
-- 公開ページはコラボレーション情報を読み取れる。
CREATE POLICY "public read collaborations" ON collaborations FOR SELECT TO anon USING (true);
-- 書き込みはバックエンドのサービスロールに限定する。
CREATE POLICY "service write collaborations" ON collaborations FOR ALL TO service_role USING (true);

-- 2. 問い合わせフォームの送信内容と管理画面での既読状態を保存する。
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- 未認証の公開フォームから問い合わせを追加できる。
CREATE POLICY "anon insert contacts" ON contacts FOR INSERT TO anon WITH CHECK (true);
-- 問い合わせの閲覧・更新はバックエンドのサービスロールに限定する。
CREATE POLICY "service manage contacts" ON contacts FOR ALL TO service_role USING (true);

-- 3. ギャラリー画像をブランド別に分類するための列を追加する。
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS brand TEXT;

-- 4. 取扱店が扱うブランド一覧を配列で保存する列を追加する。
ALTER TABLE stockists ADD COLUMN IF NOT EXISTS brands TEXT[] DEFAULT '{}';

-- 5. ワークショップ予約の確認状態を保存する列を追加し、既存行は pending にする。
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
