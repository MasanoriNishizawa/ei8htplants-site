-- Run this in the Supabase SQL editor

-- 1. collaborations table
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
CREATE POLICY "public read collaborations" ON collaborations FOR SELECT TO anon USING (true);
CREATE POLICY "service write collaborations" ON collaborations FOR ALL TO service_role USING (true);

-- 2. contacts table (saves form submissions)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert contacts" ON contacts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "service manage contacts" ON contacts FOR ALL TO service_role USING (true);

-- 3. gallery_images: add brand column
ALTER TABLE gallery_images ADD COLUMN IF NOT EXISTS brand TEXT;

-- 4. stockists: add brands column
ALTER TABLE stockists ADD COLUMN IF NOT EXISTS brands TEXT[] DEFAULT '{}';

-- 5. workshop_reservations: add status column
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
