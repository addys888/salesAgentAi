-- ═══════════════════════════════════════════════════════════
--  ADD TEAM CODE TO TENANTS
--  Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Add team_code column
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS team_code TEXT UNIQUE;

-- Set team codes for existing tenants
UPDATE tenants SET team_code = 'DIALKARO' WHERE slug = 'dialkaro';
UPDATE tenants SET team_code = 'XYZ2026' WHERE slug = 'xyzconsulting';

-- Verify
SELECT slug, app_name, team_code, max_reps FROM tenants;
