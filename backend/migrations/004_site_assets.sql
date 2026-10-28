-- Supabase SQLエディターで実行する、サイト内画像のURL設定を保存するテーブル追加SQL。

-- イベント・ギャラリー・コラボに属さないページ固有画像のキーとURLを保存する。
CREATE TABLE IF NOT EXISTS site_assets (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_assets ENABLE ROW LEVEL SECURITY;
-- 公開サイトは表示用の画像設定を読み取れる。
CREATE POLICY "public read site_assets" ON site_assets FOR SELECT TO anon USING (true);
-- 設定の追加・変更はバックエンドのサービスロールに限定する。
CREATE POLICY "service write site_assets" ON site_assets FOR ALL TO service_role USING (true);

-- ワークショップ紹介画像の設定行を用意する。URLは画像を配置した後に更新する。
INSERT INTO site_assets (key, url) VALUES
  ('workshop-about', '')
ON CONFLICT (key) DO NOTHING;
