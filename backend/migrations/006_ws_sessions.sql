-- WS session slots with per-slot capacity
CREATE TABLE ws_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  time_label text NOT NULL,
  max_participants integer NOT NULL DEFAULT 10,
  display_order integer NOT NULL DEFAULT 0
);
ALTER TABLE ws_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read ws_sessions" ON ws_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "service write ws_sessions" ON ws_sessions FOR ALL TO service_role USING (true);

-- New columns on workshop_reservations
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES ws_sessions(id) ON DELETE SET NULL;
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS bring_plant boolean NOT NULL DEFAULT false;
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS bring_pot boolean NOT NULL DEFAULT false;
