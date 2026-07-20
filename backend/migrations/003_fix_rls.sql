-- Run this in the Supabase SQL editor

-- Remove the unnecessary anon INSERT policy on contacts.
-- The backend uses service_role to insert, so anon INSERT is not needed
-- and represents an unintended write surface.
DROP POLICY IF EXISTS "anon insert contacts" ON contacts;
