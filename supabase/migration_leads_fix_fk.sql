-- ═══════════════════════════════════════════════════════════
--  LEADS — FIX assigned_to FOREIGN KEY
--
--  The frontend (auth.js loadLeads) joins leads → user_profiles
--  via PostgREST resource embedding, but the original migration
--  defined the FK against auth.users(id) — PostgREST can't see
--  that relationship, so it errors with:
--    "Could not find a relationship between 'leads' and 'user_profiles'"
--
--  Fix: repoint the FK to user_profiles(id). Same row (since
--  user_profiles.id = auth.users.id), but PostgREST can resolve it.
--
--  Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════

-- Drop the existing FK (named or auto-named — try both)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;

-- Add it back, pointing at user_profiles
ALTER TABLE leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES user_profiles(id)
  ON DELETE SET NULL;

-- Tell PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';

-- Verify (should show user_profiles as the target):
--   SELECT
--     conname, conrelid::regclass AS table, confrelid::regclass AS references
--   FROM pg_constraint
--   WHERE conname = 'leads_assigned_to_fkey';
