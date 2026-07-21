-- Run this in the Supabase SQL editor

-- Site asset URLs (page-specific images not tied to events/gallery/collaborations)
CREATE TABLE IF NOT EXISTS site_assets (
  key TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE site_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read site_assets" ON site_assets FOR SELECT TO anon USING (true);
CREATE POLICY "service write site_assets" ON site_assets FOR ALL TO service_role USING (true);

-- Initial rows (update url values after re-hosting images)
INSERT INTO site_assets (key, url) VALUES
  ('workshop-about', '')
ON CONFLICT (key) DO NOTHING;
