-- ═══════════════════════════════════════════════════════════
--  WEEK 0 SECURITY HARDENING — DialKaro
--
--  Fixes (see docs/SECURITY_WEEK0.md for the full audit):
--    C1 — close tenants INSERT/UPDATE; replace with SECURITY DEFINER RPCs
--    C2 — hide tenants secrets (admin_hash / super_hash / webhook_secret)
--         from anon SELECT via a public_tenants view
--    C3 — tighten user_profiles UPDATE; admin writes go through RPCs
--    H1 — JS-side: count only status='active' for slot checks
--
--  Idempotent: safe to re-run.
--  Reversible: rollback block at the bottom.
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 1. PLATFORM SECRETS — server-side super-admin hash
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE platform_secrets ENABLE ROW LEVEL SECURITY;
-- No public policies = inaccessible from anon/authenticated.
-- Only SECURITY DEFINER functions (running as table owner) can read it.
REVOKE ALL ON platform_secrets FROM anon, authenticated;

-- Seed CelerApps super-admin hash (matches the historical CELERAPPS_SUPER_HASH
-- in auth.js). Rotate by running:
--   UPDATE platform_secrets SET value = '<new-sha256>' WHERE key = 'celerapps_super_hash';
INSERT INTO platform_secrets (key, value)
VALUES ('celerapps_super_hash',
        '87859159d3dcdf468afe630139ba14d72603a795a085c25ca60c1ad6c3c154b7')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────
-- 2. PUBLIC VIEW — safe tenant fields only
--    Replaces direct anon SELECT on tenants.
--    Default security_invoker=false → view runs with owner's privileges,
--    so anon callers see only the columns we expose.
-- ────────────────────────────────────────
DROP VIEW IF EXISTS public_tenants CASCADE;
CREATE VIEW public_tenants AS
SELECT
  id, slug, hostname,
  app_name, app_subtitle, app_emoji,
  landing_title, landing_tagline, primary_color,
  admin_username, max_reps, subscription_end, is_active,
  team_code, created_at
FROM tenants;

GRANT SELECT ON public_tenants TO anon, authenticated;

-- ────────────────────────────────────────
-- 3. LOCK DOWN tenants — no direct anon access
-- ────────────────────────────────────────
DROP POLICY IF EXISTS "Tenants are publicly readable" ON tenants;
DROP POLICY IF EXISTS "Allow tenant inserts" ON tenants;
DROP POLICY IF EXISTS "Allow tenant updates" ON tenants;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authenticated.
-- All access goes through the RPCs below or service_role (Edge Functions).
REVOKE ALL ON tenants FROM anon, authenticated;

-- ────────────────────────────────────────
-- 4. TIGHTEN user_profiles UPDATE
--    Drop any permissive override; only self-update remains. All admin
--    mutations now go through the SECURITY DEFINER RPCs in section 6.
-- ────────────────────────────────────────
DROP POLICY IF EXISTS "Allow user_profile updates" ON user_profiles;
DROP POLICY IF EXISTS "Anyone can update user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Public can update user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ────────────────────────────────────────
-- 5. SUPER-ADMIN RPCs — gated by celerapps_super_hash
-- ────────────────────────────────────────

-- Internal helper (not exposed): does this hash match the platform secret?
CREATE OR REPLACE FUNCTION _is_celerapps_super(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE stored TEXT;
BEGIN
  SELECT value INTO stored FROM platform_secrets WHERE key = 'celerapps_super_hash';
  RETURN stored IS NOT NULL AND stored = p_hash;
END $$;
REVOKE ALL ON FUNCTION _is_celerapps_super(TEXT) FROM PUBLIC, anon, authenticated;

-- Public verifier — used by superAdminLogin to gate the OTP step
CREATE OR REPLACE FUNCTION verify_super_admin(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN _is_celerapps_super(p_hash);
END $$;
GRANT EXECUTE ON FUNCTION verify_super_admin(TEXT) TO anon, authenticated;

-- List all tenants (full data, including secrets — for the super-admin console)
CREATE OR REPLACE FUNCTION super_admin_list_tenants(p_super_hash TEXT)
RETURNS SETOF tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM tenants ORDER BY created_at;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_list_tenants(TEXT) TO anon, authenticated;

-- Create a tenant
CREATE OR REPLACE FUNCTION super_admin_create_tenant(
  p_super_hash       TEXT,
  p_slug             TEXT,
  p_hostname         TEXT,
  p_app_name         TEXT,
  p_app_subtitle     TEXT,
  p_app_emoji        TEXT,
  p_landing_title    TEXT,
  p_landing_tagline  TEXT,
  p_primary_color    TEXT,
  p_team_code        TEXT,
  p_admin_username   TEXT,
  p_admin_hash       TEXT,
  p_super_hash_local TEXT,   -- per-tenant random super_hash (unused; satisfies NOT NULL)
  p_max_reps         INT,
  p_subscription_end DATE,
  p_is_active        BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id UUID;
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_admin_hash IS NULL OR length(p_admin_hash) <> 64 THEN
    RAISE EXCEPTION 'invalid admin_hash';
  END IF;
  IF p_admin_username IS NULL OR p_admin_username !~ '^[a-zA-Z0-9._-]{2,32}$' THEN
    RAISE EXCEPTION 'invalid admin_username';
  END IF;

  INSERT INTO tenants (
    slug, hostname, app_name, app_subtitle, app_emoji,
    landing_title, landing_tagline, primary_color,
    team_code, admin_username, admin_hash, super_hash,
    max_reps, subscription_end, is_active
  ) VALUES (
    p_slug, p_hostname, p_app_name, p_app_subtitle, p_app_emoji,
    p_landing_title, p_landing_tagline, p_primary_color,
    p_team_code, p_admin_username, p_admin_hash, p_super_hash_local,
    p_max_reps, p_subscription_end, p_is_active
  ) RETURNING id INTO new_id;

  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_create_tenant(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,DATE,BOOLEAN
) TO anon, authenticated;

-- Update a single whitelisted tenant field
CREATE OR REPLACE FUNCTION super_admin_update_tenant(
  p_super_hash TEXT,
  p_tenant_id  UUID,
  p_field      TEXT,
  p_value      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_field NOT IN (
    'team_code','max_reps','admin_username','subscription_end',
    'is_active','app_name','app_subtitle','app_emoji',
    'landing_title','landing_tagline','primary_color','admin_hash','hostname'
  ) THEN
    RAISE EXCEPTION 'invalid field: %', p_field;
  END IF;

  IF p_field = 'admin_username' AND (p_value !~ '^[a-zA-Z0-9._-]{2,32}$') THEN
    RAISE EXCEPTION 'invalid admin_username';
  END IF;
  IF p_field = 'admin_hash' AND length(p_value) <> 64 THEN
    RAISE EXCEPTION 'invalid admin_hash';
  END IF;

  IF p_field = 'max_reps' THEN
    EXECUTE format('UPDATE tenants SET %I = $1 WHERE id = $2', p_field)
      USING NULLIF(p_value,'')::INT, p_tenant_id;
  ELSIF p_field = 'subscription_end' THEN
    EXECUTE format('UPDATE tenants SET %I = $1 WHERE id = $2', p_field)
      USING NULLIF(p_value,'')::DATE, p_tenant_id;
  ELSIF p_field = 'is_active' THEN
    EXECUTE format('UPDATE tenants SET %I = $1 WHERE id = $2', p_field)
      USING (p_value::BOOLEAN), p_tenant_id;
  ELSE
    EXECUTE format('UPDATE tenants SET %I = $1 WHERE id = $2', p_field)
      USING p_value, p_tenant_id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_update_tenant(TEXT,UUID,TEXT,TEXT) TO anon, authenticated;

-- ────────────────────────────────────────
-- 6. TENANT-ADMIN RPCs — gated by tenants.admin_hash / super_hash
-- ────────────────────────────────────────

-- Verify tenant admin login. Returns tenant fields + role flag.
-- Replaces the client-side hash comparison in auth.js adminLogin.
CREATE OR REPLACE FUNCTION verify_tenant_admin(
  p_username TEXT,
  p_hash     TEXT
) RETURNS TABLE (
  id              UUID,
  slug            TEXT,
  hostname        TEXT,
  app_name        TEXT,
  app_subtitle    TEXT,
  app_emoji       TEXT,
  landing_title   TEXT,
  landing_tagline TEXT,
  primary_color   TEXT,
  admin_username  TEXT,
  max_reps        INT,
  subscription_end DATE,
  is_active       BOOLEAN,
  team_code       TEXT,
  is_super        BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.slug, t.hostname,
    t.app_name, t.app_subtitle, t.app_emoji,
    t.landing_title, t.landing_tagline, t.primary_color,
    t.admin_username, t.max_reps, t.subscription_end, t.is_active,
    t.team_code,
    (t.super_hash = p_hash) AS is_super
  FROM tenants t
  WHERE t.admin_username = p_username
    AND t.is_active = TRUE
    AND (t.admin_hash = p_hash OR t.super_hash = p_hash)
  LIMIT 1;
END $$;
GRANT EXECUTE ON FUNCTION verify_tenant_admin(TEXT,TEXT) TO anon, authenticated;

-- Get a tenant's webhook secret (admin or super hash required)
CREATE OR REPLACE FUNCTION tenant_admin_get_webhook_secret(
  p_tenant_id  UUID,
  p_admin_hash TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ws TEXT;
BEGIN
  SELECT webhook_secret INTO ws FROM tenants
   WHERE id = p_tenant_id
     AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
     AND is_active = TRUE;
  IF ws IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  RETURN ws;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_get_webhook_secret(UUID,TEXT) TO anon, authenticated;

-- Helper: validate that p_admin_hash matches the rep's tenant admin/super hash
CREATE OR REPLACE FUNCTION _admin_owns_rep(p_admin_hash TEXT, p_rep_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rep_tenant UUID;
BEGIN
  SELECT tenant_id INTO rep_tenant FROM user_profiles WHERE id = p_rep_id;
  IF rep_tenant IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM tenants
     WHERE id = rep_tenant
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  );
END $$;
REVOKE ALL ON FUNCTION _admin_owns_rep(TEXT,UUID) FROM PUBLIC, anon, authenticated;

-- Helper: super_hash-only check (for subscription_end + max_reps)
CREATE OR REPLACE FUNCTION _admin_is_super_for_tenant(p_admin_hash TEXT, p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tenants
     WHERE id = p_tenant_id
       AND super_hash = p_admin_hash
       AND is_active = TRUE
  );
END $$;
REVOKE ALL ON FUNCTION _admin_is_super_for_tenant(TEXT,UUID) FROM PUBLIC, anon, authenticated;

-- Update a rep's status (approve/reject/suspend/activate)
CREATE OR REPLACE FUNCTION tenant_admin_update_rep_status(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_new_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_status NOT IN ('active','suspended','rejected','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF NOT _admin_owns_rep(p_admin_hash, p_rep_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE user_profiles SET status = p_new_status WHERE id = p_rep_id;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_update_rep_status(TEXT,UUID,TEXT) TO anon, authenticated;

-- Set a rep's specialty
CREATE OR REPLACE FUNCTION tenant_admin_set_rep_specialty(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_specialty  TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT _admin_owns_rep(p_admin_hash, p_rep_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  UPDATE user_profiles SET specialty = NULLIF(TRIM(p_specialty),'') WHERE id = p_rep_id;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_rep_specialty(TEXT,UUID,TEXT) TO anon, authenticated;

-- Set a rep's subscription_end (super_hash only — preserves UI rule)
CREATE OR REPLACE FUNCTION tenant_admin_set_rep_subscription(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_sub_end    DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rep_tenant UUID; was_suspended BOOLEAN;
BEGIN
  SELECT tenant_id INTO rep_tenant FROM user_profiles WHERE id = p_rep_id;
  IF rep_tenant IS NULL THEN RAISE EXCEPTION 'rep not found'; END IF;
  IF NOT _admin_is_super_for_tenant(p_admin_hash, rep_tenant) THEN
    RAISE EXCEPTION 'unauthorized: super admin only' USING ERRCODE = '42501';
  END IF;
  UPDATE user_profiles
     SET subscription_end = p_sub_end,
         status = CASE WHEN status = 'suspended' THEN 'active' ELSE status END
   WHERE id = p_rep_id;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_rep_subscription(TEXT,UUID,DATE) TO anon, authenticated;

-- Update a tenant's max_reps (super_hash only)
CREATE OR REPLACE FUNCTION tenant_admin_set_max_reps(
  p_admin_hash TEXT,
  p_tenant_id  UUID,
  p_max_reps   INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_max_reps IS NULL OR p_max_reps < 1 OR p_max_reps > 500 THEN
    RAISE EXCEPTION 'invalid max_reps';
  END IF;
  IF NOT _admin_is_super_for_tenant(p_admin_hash, p_tenant_id) THEN
    RAISE EXCEPTION 'unauthorized: super admin only' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET max_reps = p_max_reps WHERE id = p_tenant_id;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_max_reps(TEXT,UUID,INT) TO anon, authenticated;

-- Active rep count for slot checks (H1)
CREATE OR REPLACE FUNCTION tenant_active_rep_count(p_tenant_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INT FROM user_profiles
   WHERE tenant_id = p_tenant_id AND status = 'active';
$$;
GRANT EXECUTE ON FUNCTION tenant_active_rep_count(UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 7. SCHEMA RELOAD
-- ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
--  VERIFICATION (run as anon to confirm hardening)
--
--    SELECT * FROM public_tenants;     -- should succeed (no secrets)
--    SELECT * FROM tenants;            -- should fail (permission denied)
--    SELECT * FROM platform_secrets;   -- should fail
--    SELECT verify_super_admin('not-a-real-hash');  -- false
--
--  Re-run any time. Idempotent.
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
--  ROLLBACK (run only if you must revert to pre-Week-0 state)
-- ═══════════════════════════════════════════════════════════
-- BEGIN;
--   DROP VIEW IF EXISTS public_tenants;
--   DROP FUNCTION IF EXISTS verify_super_admin(TEXT);
--   DROP FUNCTION IF EXISTS super_admin_list_tenants(TEXT);
--   DROP FUNCTION IF EXISTS super_admin_create_tenant(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,DATE,BOOLEAN);
--   DROP FUNCTION IF EXISTS super_admin_update_tenant(TEXT,UUID,TEXT,TEXT);
--   DROP FUNCTION IF EXISTS verify_tenant_admin(TEXT,TEXT);
--   DROP FUNCTION IF EXISTS tenant_admin_get_webhook_secret(UUID,TEXT);
--   DROP FUNCTION IF EXISTS tenant_admin_update_rep_status(TEXT,UUID,TEXT);
--   DROP FUNCTION IF EXISTS tenant_admin_set_rep_specialty(TEXT,UUID,TEXT);
--   DROP FUNCTION IF EXISTS tenant_admin_set_rep_subscription(TEXT,UUID,DATE);
--   DROP FUNCTION IF EXISTS tenant_admin_set_max_reps(TEXT,UUID,INT);
--   DROP FUNCTION IF EXISTS tenant_active_rep_count(UUID);
--   DROP FUNCTION IF EXISTS _is_celerapps_super(TEXT);
--   DROP FUNCTION IF EXISTS _admin_owns_rep(TEXT,UUID);
--   DROP FUNCTION IF EXISTS _admin_is_super_for_tenant(TEXT,UUID);
--   CREATE POLICY "Tenants are publicly readable" ON tenants FOR SELECT USING (true);
--   CREATE POLICY "Allow tenant inserts" ON tenants FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Allow tenant updates" ON tenants FOR UPDATE USING (true);
--   GRANT SELECT, INSERT, UPDATE ON tenants TO anon, authenticated;
-- COMMIT;
