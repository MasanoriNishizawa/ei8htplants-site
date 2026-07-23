ALTER TABLE workshop_reservations
  ADD COLUMN IF NOT EXISTS preferred_date text,
  ADD COLUMN IF NOT EXISTS preferred_time text;
