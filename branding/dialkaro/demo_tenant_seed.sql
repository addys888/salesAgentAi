-- ═══════════════════════════════════════════════════════════
--  DEMO TENANT SEED — for the 60-sec Loom recording
--
--  Creates a clean "DialKaro Demo" tenant so the demo recording
--  shows realistic specialty routing in action without polluting
--  any production tenant.
--
--  Login:
--    URL:      https://dialkaro.celerapps.com  (or your dev host)
--    Username: demoadmin
--    Password: demo1234
--
--  ⚠️ Run AFTER your existing migrations are applied.
--  ⚠️ Run in Supabase Dashboard → SQL Editor → New Query.
-- ═══════════════════════════════════════════════════════════

-- ── STEP 1: Generate the SHA-256 hash of the password "demo1234" ──
-- Run this in your terminal first, then paste the output below:
--
--   echo -n "demo1234" | shasum -a 256
--
-- Replace ADMIN_HASH_HERE with the 64-char hex you get back.
-- (We do this client-side because Postgres' default install doesn't
--  always have pgcrypto's digest() enabled, and matching the JS
--  sha256() in auth.js this way is foolproof.)

INSERT INTO tenants (
  slug, hostname, app_name, app_subtitle, app_emoji,
  landing_title, landing_tagline, primary_color,
  team_code, admin_username, admin_hash,
  super_hash,        -- random unused value (NOT NULL constraint only)
  max_reps, is_active
)
SELECT
  'demo',
  'dialkaro.celerapps.com',
  'DialKaro Demo',
  'AI sales dialer · live demo tenant',
  '🎬',
  'DialKaro Demo',
  'Live demo tenant — auto-routing leads in real time',
  '#7C3AED',
  'DEMO2026',
  'demoadmin',
  'ADMIN_HASH_HERE',   -- ← paste SHA-256("demo1234") here
  encode(gen_random_bytes(32), 'hex'),  -- random, unused (super_hash is per-platform now, not per-tenant)
  10,
  true
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'demo');

-- ── Verify ──
SELECT slug, app_name, admin_username, primary_color, max_reps, is_active
  FROM tenants WHERE slug = 'demo';

-- ═══════════════════════════════════════════════════════════
--  AFTER seeding, through the admin UI:
--    1. Login at the dialer with team code DEMO2026, password demo1234
--    2. Open admin console → create 4 reps with these specialties:
--         - Rohit Sharma   · home-loan
--         - Priya Iyer     · health-insurance
--         - Aakash Verma   · personal-loan
--         - Sneha Kulkarni · life-insurance
--    3. Upload demo-sample-leads.csv (in this folder)
--    4. Record the Loom — leads will auto-route by specialty
-- ═══════════════════════════════════════════════════════════
