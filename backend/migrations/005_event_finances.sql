-- Event finances tracking
CREATE TABLE event_finances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sales integer NOT NULL DEFAULT 0,
  booth_fee integer NOT NULL DEFAULT 0,
  distance integer NOT NULL DEFAULT 0,        -- km (one-way)
  gas_price integer NOT NULL DEFAULT 170,     -- yen per liter
  expressway_toll integer NOT NULL DEFAULT 0,
  accommodation integer NOT NULL DEFAULT 0,
  ws_participants integer NOT NULL DEFAULT 0,
  payment_flag boolean NOT NULL DEFAULT false,
  other_expenses integer NOT NULL DEFAULT 0,
  other_expenses_note text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

ALTER TABLE event_finances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON event_finances FOR ALL TO service_role USING (true);
