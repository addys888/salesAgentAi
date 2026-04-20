-- ═══════════════════════════════════════════════════════════
--  DIALKARO MULTI-TENANT MIGRATION (Supabase-compatible)
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--  NOTE: Run each section one at a time if you get errors
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- SECTION 1: CREATE TENANTS TABLE
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  hostname TEXT NOT NULL,
  app_name TEXT NOT NULL DEFAULT 'DialKaro',
  app_subtitle TEXT DEFAULT 'Dial Faster · Close Smarter',
  app_emoji TEXT DEFAULT '☎️',
  landing_title TEXT DEFAULT 'DialKaro',
  landing_tagline TEXT DEFAULT 'Your team''s calling command centre',
  primary_color TEXT DEFAULT '#25D366',
  admin_hash TEXT NOT NULL,
  super_hash TEXT NOT NULL,
  max_reps INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed your default tenant (uses existing hashes from auth.js)
INSERT INTO tenants (slug, hostname, app_name, admin_hash, super_hash)
SELECT 'dialkaro', 'dialkaro.celerapps.com', 'DialKaro',
  '4512f5c7a37aa142b97bde9f8b2d8a1382d5118e1e87ffdf035d3bfaeb6b8e29',
  '18c6a08bbf0b4a16a736238b3fee6d6330c778041f436cf22c2f61e729a81c39'
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE slug = 'dialkaro');

-- ────────────────────────────────────────
-- SECTION 2: ADD tenant_id COLUMNS
-- ────────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE callbacks ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- ────────────────────────────────────────
-- SECTION 3: BACKFILL existing data with default tenant
-- ────────────────────────────────────────
UPDATE user_profiles SET tenant_id = (SELECT id FROM tenants WHERE slug = 'dialkaro') WHERE tenant_id IS NULL;
UPDATE call_sessions SET tenant_id = (SELECT id FROM tenants WHERE slug = 'dialkaro') WHERE tenant_id IS NULL;
UPDATE daily_stats SET tenant_id = (SELECT id FROM tenants WHERE slug = 'dialkaro') WHERE tenant_id IS NULL;
UPDATE callbacks SET tenant_id = (SELECT id FROM tenants WHERE slug = 'dialkaro') WHERE tenant_id IS NULL;

-- ────────────────────────────────────────
-- SECTION 4: RLS POLICIES
-- ────────────────────────────────────────

-- TENANTS: publicly readable (app needs to load config)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenants are publicly readable" ON tenants;
CREATE POLICY "Tenants are publicly readable"
  ON tenants FOR SELECT USING (true);

-- USER_PROFILES
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own tenant profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can read own tenant profiles"
  ON user_profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE USING (id = auth.uid());

-- CALL_SESSIONS
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own sessions" ON call_sessions;
CREATE POLICY "Users can manage own sessions"
  ON call_sessions FOR ALL USING (user_id = auth.uid());

-- CALLBACKS
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own callbacks" ON callbacks;
CREATE POLICY "Users can manage own callbacks"
  ON callbacks FOR ALL USING (user_id = auth.uid());

-- DAILY_STATS
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage own daily stats" ON daily_stats;
DROP POLICY IF EXISTS "Authenticated users can read tenant daily_stats" ON daily_stats;

CREATE POLICY "Users can manage own daily stats"
  ON daily_stats FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can read tenant daily_stats"
  ON daily_stats FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ────────────────────────────────────────
-- SECTION 5: INDEXES
-- ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_tenant ON call_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant ON daily_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_tenant ON callbacks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_hostname ON tenants(hostname);

-- ═══════════════════════════════════════════════════════════
--  DONE! Verify by running: SELECT * FROM tenants;
-- ═══════════════════════════════════════════════════════════
