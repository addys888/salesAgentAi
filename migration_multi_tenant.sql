-- ═══════════════════════════════════════════════════════════
--  DIALKARO MULTI-TENANT MIGRATION
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 1. CREATE TENANTS TABLE
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,                    -- 'dialkaro', 'clientA', etc.
  hostname TEXT UNIQUE NOT NULL,                -- 'dialkaro.celerapps.com'
  app_name TEXT NOT NULL DEFAULT 'DialKaro',
  app_subtitle TEXT DEFAULT 'Dial Faster · Close Smarter',
  app_emoji TEXT DEFAULT '☎️',
  landing_title TEXT DEFAULT 'DialKaro',
  landing_tagline TEXT DEFAULT 'Your team''s calling command centre',
  primary_color TEXT DEFAULT '#25D366',
  admin_hash TEXT NOT NULL,                     -- SHA-256 of admin password
  super_hash TEXT NOT NULL,                     -- SHA-256 of super admin password
  max_reps INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed your default tenant (uses existing hashes from auth.js)
INSERT INTO tenants (slug, hostname, app_name, admin_hash, super_hash) VALUES
(
  'dialkaro',
  'dialkaro.celerapps.com',
  'DialKaro',
  '4512f5c7a37aa142b97bde9f8b2d8a1382d5118e1e87ffdf035d3bfaeb6b8e29',
  '18c6a08bbf0b4a16a736238b3fee6d6330c778041f436cf22c2f61e729a81c39'
);

-- ────────────────────────────────────────
-- 2. ADD tenant_id TO EXISTING TABLES
-- ────────────────────────────────────────

-- Get default tenant ID for backfilling existing data
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'dialkaro';

  -- user_profiles
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'tenant_id') THEN
    ALTER TABLE user_profiles ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    UPDATE user_profiles SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;

  -- call_sessions
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_sessions' AND column_name = 'tenant_id') THEN
    ALTER TABLE call_sessions ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    UPDATE call_sessions SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;

  -- daily_stats
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_stats' AND column_name = 'tenant_id') THEN
    ALTER TABLE daily_stats ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    UPDATE daily_stats SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;

  -- callbacks
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'callbacks' AND column_name = 'tenant_id') THEN
    ALTER TABLE callbacks ADD COLUMN tenant_id UUID REFERENCES tenants(id);
    UPDATE callbacks SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
END $$;

-- ────────────────────────────────────────
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ────────────────────────────────────────

-- TENANTS table: anyone can read (needed for app to load config)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants are publicly readable"
  ON tenants FOR SELECT
  USING (true);

-- USER_PROFILES: users can only see/modify within their tenant
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist (safe to run multiple times)
DROP POLICY IF EXISTS "Users can read own tenant profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can read own tenant profiles"
  ON user_profiles FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
    OR auth.uid() IS NULL  -- Allow during registration check
  );

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- CALL_SESSIONS: users can only access their own sessions
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own sessions" ON call_sessions;
CREATE POLICY "Users can manage own sessions"
  ON call_sessions FOR ALL
  USING (user_id = auth.uid());

-- CALLBACKS: users can only access their own callbacks
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own callbacks" ON callbacks;
CREATE POLICY "Users can manage own callbacks"
  ON callbacks FOR ALL
  USING (user_id = auth.uid());

-- DAILY_STATS: users can manage own, admin can read all in tenant
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own daily stats" ON daily_stats;
CREATE POLICY "Users can manage own daily stats"
  ON daily_stats FOR ALL
  USING (user_id = auth.uid());

-- NOTE: Admin panel reads use the service key or anon key with
-- tenant_id filter in the app code. For admin to see all users
-- in their tenant, we need a broader SELECT policy:
DROP POLICY IF EXISTS "Authenticated users can read tenant daily_stats" ON daily_stats;
CREATE POLICY "Authenticated users can read tenant daily_stats"
  ON daily_stats FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ────────────────────────────────────────
-- 4. INDEXES FOR PERFORMANCE
-- ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_tenant ON call_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant ON daily_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_callbacks_tenant ON callbacks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_hostname ON tenants(hostname);

-- ═══════════════════════════════════════════════════════════
--  DONE! Your database is now multi-tenant ready.
--  
--  To add a new client, just run:
--  INSERT INTO tenants (slug, hostname, app_name, admin_hash, super_hash)
--  VALUES ('client_slug', 'dialkaro.celerapps.com', 'ClientName',
--          'sha256_of_admin_pass', 'sha256_of_super_pass');
-- ═══════════════════════════════════════════════════════════
