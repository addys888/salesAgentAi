-- ═══════════════════════════════════════════════════════════
--  ADD CLIENT: XYZ Consulting
--  Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

INSERT INTO tenants (
  slug,
  hostname,
  app_name,
  app_subtitle,
  app_emoji,
  landing_title,
  landing_tagline,
  primary_color,
  admin_hash,
  super_hash,
  max_reps,
  is_active
) VALUES (
  'xyzconsulting',                                                          -- slug (unique identifier)
  'dialkaro.celerapps.com',                                                 -- shares same hostname (tenant detected by admin login)
  'XYZ Consulting',                                                         -- app name (shown in header)
  'Connect · Convert · Close',                                              -- subtitle (shown below name)
  '🏢',                                                                     -- emoji icon
  'XYZ Consulting',                                                         -- landing page title
  'Empowering your sales force with smart dialing',                         -- landing tagline
  '#4A90D9',                                                                -- brand blue
  '971f61c995b86eaa285c887b11f65f2b2175d63350a298050cf448274b47bfda',      -- admin password: xyz@admin2026
  '8f79d4da556c380d7052da98cd03a61ee0d3b09d5c90b078462a8e952d32ea93',      -- super admin password: xyz@super2026
  15,                                                                       -- max reps allowed
  true
);

-- Verify:
SELECT id, slug, app_name, max_reps FROM tenants;

-- ═══════════════════════════════════════════════════════════
--  CREDENTIALS (SHARE SECURELY WITH CLIENT)
--  
--  Manager Login URL:  https://dialkaro.celerapps.com
--  Username:           admin
--  Admin Password:     xyz@admin2026
--  Super Admin Pass:   xyz@super2026  (only for you/Adarsh)
--
--  HOW IT WORKS:
--  When XYZ's manager logs in with "xyz@admin2026",
--  the system matches the hash → loads XYZ Consulting tenant
--  → shows their branding, their reps, their data.
-- ═══════════════════════════════════════════════════════════
