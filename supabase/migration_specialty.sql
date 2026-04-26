-- ═══════════════════════════════════════════════════════════
--  SPECIALTY-BASED LEAD ROUTING
--  Adds skill-based filtering on top of round-robin.
--
--  Behavior:
--   • If a webhook sends `specialty` AND ≥1 active rep with the same
--     specialty exists → route only among them (case-insensitive).
--   • If specialty is set but no rep matches → fall back to all
--     active reps (don't lose the lead).
--   • If specialty is null → existing round-robin across all reps.
--
--  Run AFTER migration_leads_fix_fk.sql
-- ═══════════════════════════════════════════════════════════

-- Per-rep specialty (free-text — each tenant defines their own values)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS specialty TEXT;

-- Per-lead specialty (set by webhook payload)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS specialty TEXT;

-- Index supports the edge function's "active reps with matching specialty"
-- lookup. Partial index keeps it lean — only active rows.
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_specialty
  ON user_profiles (tenant_id, lower(specialty))
  WHERE status = 'active' AND specialty IS NOT NULL;

-- PostgREST schema cache reload so the new columns are visible immediately
NOTIFY pgrst, 'reload schema';

-- Verify:
--   SELECT id, full_name, specialty FROM user_profiles WHERE tenant_id = '<uuid>';
--   SELECT id, full_name, specialty, status FROM leads ORDER BY created_at DESC LIMIT 5;
