-- ═══════════════════════════════════════════════════════════
--  LEADS — COST OPTIMIZATION + AUTO-PURGE
--  Run AFTER migration_leads.sql in Supabase SQL Editor
--
--  Effect: ~3–4× smaller per-row footprint
--    Before: ~1.5 KB/lead → After: ~400 B/lead
--    Free-tier capacity: 330K leads → ~1.2M leads
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- SECTION 1: DROP DEBUG-ONLY COLUMN
--   raw_data was the full webhook payload (600–1500 B/row).
--   Only useful while debugging integrations — drop once stable.
-- ────────────────────────────────────────
ALTER TABLE leads DROP COLUMN IF EXISTS raw_data;

-- ────────────────────────────────────────
-- SECTION 2: DROP REDUNDANT INDEXES
--   idx_leads_tenant         → covered by idx_leads_tenant_status
--   idx_leads_status         → low cardinality, rarely queried alone
-- ────────────────────────────────────────
DROP INDEX IF EXISTS idx_leads_tenant;
DROP INDEX IF EXISTS idx_leads_status;

-- ────────────────────────────────────────
-- SECTION 3: AUTO-PURGE OLD LEADS (pg_cron)
--   Deletes leads older than 90 days that are already
--   processed (called, not_interested, invalid).
--   Keeps: 'new', 'interested', 'callback' regardless of age.
-- ────────────────────────────────────────

-- Enable pg_cron (one-time per project — safe to re-run)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior schedule with the same name (idempotent)
SELECT cron.unschedule('leads-purge-90d')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leads-purge-90d');

-- Schedule daily purge at 03:00 UTC (08:30 IST)
SELECT cron.schedule(
  'leads-purge-90d',
  '0 3 * * *',
  $$
    DELETE FROM leads
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND status IN ('called', 'not_interested', 'invalid');
  $$
);

-- ────────────────────────────────────────
-- SECTION 4: VERIFY
-- ────────────────────────────────────────
-- Check the cron job was registered:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'leads-purge-90d';
--
-- Confirm raw_data is gone:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'leads';
--
-- Confirm indexes:
--   SELECT indexname FROM pg_indexes WHERE tablename = 'leads';

-- ═══════════════════════════════════════════════════════════
--  DONE
-- ═══════════════════════════════════════════════════════════
