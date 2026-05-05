-- ═══════════════════════════════════════════════════════════
--  WEEK 1 SECURITY HARDENING — DialKaro
--
--  Run AFTER migration_security_week0.sql.
--
--  Fixes (see docs/SECURITY_WEEK1.md for the full audit context):
--    C4 — move user status into auth.users.raw_app_meta_data so the JWT
--         carries it. RLS policies on call_sessions / daily_stats /
--         callbacks / leads now require app_metadata.status='active'.
--         A pending/rejected/suspended rep with a valid JWT can no
--         longer perform sensitive operations.
--    H3 — Postgres BEFORE INSERT/UPDATE trigger that enforces
--         tenants.max_reps even under a race (two concurrent activations).
--    H4 — leads UPDATE restricted to assigned_to = auth.uid() AND
--         status='active'. DELETE restricted to a tenant-admin RPC
--         (no direct DELETE from reps).
--
--  Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 1. C4 — STATUS LIVES IN auth.users.raw_app_meta_data
-- ────────────────────────────────────────

-- Backfill: for every existing user_profile, copy status into auth metadata.
UPDATE auth.users u
   SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb)
                        || jsonb_build_object('status', up.status,
                                              'tenant_id', up.tenant_id::text)
  FROM user_profiles up
 WHERE up.id = u.id;

-- Helper: read the status claim from the current JWT.
-- COALESCE so JWTs minted before the migration (no claim yet) are treated
-- as 'pending' until the user re-authenticates.
CREATE OR REPLACE FUNCTION jwt_status() RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.app_metadata', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb ->> 'status';
$$;

-- Simpler helper that handles both Supabase claim shapes.
CREATE OR REPLACE FUNCTION is_active_session() RETURNS BOOLEAN
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims JSONB;
  s TEXT;
BEGIN
  -- Try Supabase's nested app_metadata claim first.
  BEGIN
    claims := COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    claims := '{}'::jsonb;
  END;
  s := claims #>> '{app_metadata,status}';
  IF s IS NULL THEN s := claims ->> 'status'; END IF;
  RETURN s = 'active';
END $$;
GRANT EXECUTE ON FUNCTION is_active_session() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION jwt_status() TO anon, authenticated;

-- Privileged setter — only callable from SECURITY DEFINER functions in this
-- migration (e.g. tenant_admin_update_rep_status). NOT exposed to clients.
CREATE OR REPLACE FUNCTION _set_user_app_status(p_user_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
     SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
                          || jsonb_build_object('status', p_status)
   WHERE id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION _set_user_app_status(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Replace tenant_admin_update_rep_status to also sync app_metadata.
-- (Drop + recreate so signature changes don't break existing grants.)
DROP FUNCTION IF EXISTS tenant_admin_update_rep_status(TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION tenant_admin_update_rep_status(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_new_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_new_status NOT IN ('active','suspended','rejected','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF NOT _admin_owns_rep(p_admin_hash, p_rep_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- user_profiles.status drives the app's UI; app_metadata.status drives RLS.
  -- Update both — the H3 trigger may RAISE if going active over max_reps.
  UPDATE user_profiles SET status = p_new_status WHERE id = p_rep_id;
  PERFORM _set_user_app_status(p_rep_id, p_new_status);
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_update_rep_status(TEXT,UUID,TEXT) TO anon, authenticated;

-- Same for set_rep_subscription (it can flip 'suspended' → 'active' as a
-- side-effect when an admin extends the date).
DROP FUNCTION IF EXISTS tenant_admin_set_rep_subscription(TEXT, UUID, DATE);
CREATE OR REPLACE FUNCTION tenant_admin_set_rep_subscription(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_sub_end    DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE rep_tenant UUID; new_status TEXT;
BEGIN
  SELECT tenant_id INTO rep_tenant FROM user_profiles WHERE id = p_rep_id;
  IF rep_tenant IS NULL THEN RAISE EXCEPTION 'rep not found'; END IF;
  IF NOT _admin_is_super_for_tenant(p_admin_hash, rep_tenant) THEN
    RAISE EXCEPTION 'unauthorized: super admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE user_profiles
     SET subscription_end = p_sub_end,
         status = CASE WHEN status = 'suspended' THEN 'active' ELSE status END
   WHERE id = p_rep_id
   RETURNING status INTO new_status;

  PERFORM _set_user_app_status(p_rep_id, new_status);
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_rep_subscription(TEXT,UUID,DATE) TO anon, authenticated;

-- ────────────────────────────────────────
-- 2. C4 — TRIGGER: prevent reps from changing privileged fields on themselves
--    (status, tenant_id, subscription_end).
--    SECURITY DEFINER admin RPCs run as the function owner — auth.uid()
--    inside them returns NULL, so the guard skips them.
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _user_profile_self_guard()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    -- Either an admin RPC (auth.uid() null) or someone else's row
    -- (will be blocked by RLS anyway). Skip the guard.
    RETURN NEW;
  END IF;

  -- Self-update: lock down sensitive columns.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'cannot change status directly — ask your manager';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'cannot change tenant_id directly';
  END IF;
  IF NEW.subscription_end IS DISTINCT FROM OLD.subscription_end THEN
    RAISE EXCEPTION 'cannot change subscription_end directly';
  END IF;
  IF NEW.specialty IS DISTINCT FROM OLD.specialty THEN
    RAISE EXCEPTION 'specialty is set by your manager';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS user_profile_self_guard ON user_profiles;
CREATE TRIGGER user_profile_self_guard
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION _user_profile_self_guard();

-- ────────────────────────────────────────
-- 3. H3 — TRIGGER: enforce tenants.max_reps on activation
--    Catches the race condition: two simultaneous activations both passing
--    the JS-side count check would have one fail at the DB level.
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _enforce_max_reps()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  active_count INT;
  rep_limit    INT;
  becoming_active BOOLEAN;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  -- Only enforce when status is going TO 'active' from a non-active state
  -- (or on INSERT directly into 'active', which the app shouldn't do but
  -- could happen via the super-admin RPCs).
  IF TG_OP = 'INSERT' THEN
    becoming_active := (NEW.status = 'active');
  ELSE  -- UPDATE
    becoming_active := (NEW.status = 'active' AND COALESCE(OLD.status,'') <> 'active');
  END IF;

  IF NOT becoming_active THEN RETURN NEW; END IF;

  SELECT max_reps INTO rep_limit FROM tenants WHERE id = NEW.tenant_id;
  IF rep_limit IS NULL THEN rep_limit := 10; END IF;

  -- Count siblings (excluding this row, which may already be present).
  SELECT COUNT(*) INTO active_count
    FROM user_profiles
   WHERE tenant_id = NEW.tenant_id
     AND status = 'active'
     AND id <> NEW.id;

  IF active_count >= rep_limit THEN
    RAISE EXCEPTION 'TENANT_FULL: tenant has reached max_reps (%)', rep_limit
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_max_reps ON user_profiles;
CREATE TRIGGER enforce_max_reps
  BEFORE INSERT OR UPDATE OF status ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION _enforce_max_reps();

-- ────────────────────────────────────────
-- 4. C4 — STATUS-AWARE RLS POLICIES
-- ────────────────────────────────────────

-- user_profiles: keep SELECT permissive (USING(true)) so admin/super-admin
--  tabs (Users / Leaderboard / Global Stats) — which run as the anon role
--  with no Supabase session — keep working. Privacy on user_profiles is a
--  Week-2 followup (move admin reads to an RPC, then tighten this).
--  INSERT/UPDATE policies are unchanged from Week 0 (id = auth.uid()), and
--  the new self-guard trigger prevents reps from mutating privileged
--  columns even on their own row.
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own tenant profiles" ON user_profiles;
CREATE POLICY "Profiles readable (admin compat)"
  ON user_profiles FOR SELECT
  USING (true);

-- call_sessions: own + active session
DROP POLICY IF EXISTS "Users can manage own sessions" ON call_sessions;
CREATE POLICY "Users can manage own sessions (active)"
  ON call_sessions FOR ALL
  USING (user_id = auth.uid() AND is_active_session())
  WITH CHECK (user_id = auth.uid() AND is_active_session());

-- callbacks: own + active session
DROP POLICY IF EXISTS "Users can manage own callbacks" ON callbacks;
CREATE POLICY "Users can manage own callbacks (active)"
  ON callbacks FOR ALL
  USING (user_id = auth.uid() AND is_active_session())
  WITH CHECK (user_id = auth.uid() AND is_active_session());

-- daily_stats: write requires active session (own row); read stays permissive
--  so admin Analytics / Leaderboard / Global Stats tabs work without a
--  Supabase session. (Same Week-2 followup as user_profiles SELECT above.)
DROP POLICY IF EXISTS "Users can manage own daily stats" ON daily_stats;
DROP POLICY IF EXISTS "Authenticated users can read tenant daily_stats" ON daily_stats;

CREATE POLICY "Users can write own daily stats (active)"
  ON daily_stats FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_active_session());

CREATE POLICY "Users can update own daily stats (active)"
  ON daily_stats FOR UPDATE
  USING (user_id = auth.uid() AND is_active_session())
  WITH CHECK (user_id = auth.uid() AND is_active_session());

CREATE POLICY "Daily stats readable (admin compat)"
  ON daily_stats FOR SELECT
  USING (true);

-- ────────────────────────────────────────
-- 5. H4 — leads: tighten UPDATE/DELETE
-- ────────────────────────────────────────

-- Read: rep with active session sees their tenant's leads.
--  Admin Leads tab reads without a session — kept permissive for now (same
--  Week-2 followup as user_profiles / daily_stats SELECT). Lead phone numbers
--  are sensitive, so this is on the Week-2 list to lock down via an RPC.
DROP POLICY IF EXISTS "Users can read tenant leads" ON leads;
CREATE POLICY "Leads readable (admin compat)"
  ON leads FOR SELECT
  USING (true);

-- Insert: still service-role only (Edge Function); no anon/authenticated path
DROP POLICY IF EXISTS "Service can insert leads" ON leads;
-- (no replacement — RLS denies INSERT for anon/authenticated by default)

-- Update: ONLY rep's own assignments + active session
DROP POLICY IF EXISTS "Users can update assigned leads" ON leads;
CREATE POLICY "Users can update own assigned leads (active)"
  ON leads FOR UPDATE
  USING (assigned_to = auth.uid() AND is_active_session())
  WITH CHECK (assigned_to = auth.uid() AND is_active_session());

-- Delete: no direct delete from reps. Tenant admin uses the RPC below.
DROP POLICY IF EXISTS "Users can delete tenant leads" ON leads;
-- (no replacement — RLS denies DELETE for anon/authenticated by default)

CREATE OR REPLACE FUNCTION tenant_admin_delete_lead(
  p_admin_hash TEXT,
  p_lead_id    UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE lead_tenant UUID;
BEGIN
  SELECT tenant_id INTO lead_tenant FROM leads WHERE id = p_lead_id;
  IF lead_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenants
     WHERE id = lead_tenant
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  DELETE FROM leads WHERE id = p_lead_id;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_delete_lead(TEXT,UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 6. ADMIN RPC: list reps for a tenant
--    Replaces the direct user_profiles SELECT in the admin Users tab
--    (which would otherwise be blocked by the new tighter SELECT policy
--    for admin sessions that have no Supabase auth user).
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION tenant_admin_list_reps(
  p_admin_hash TEXT,
  p_tenant_id  UUID
) RETURNS SETOF user_profiles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenants
     WHERE id = p_tenant_id
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT * FROM user_profiles WHERE tenant_id = p_tenant_id ORDER BY created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_list_reps(TEXT,UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 7. SCHEMA RELOAD
-- ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
--  VERIFICATION
--    -- check claims helper:
--    SELECT is_active_session();   -- as anon: false
--    -- check trigger fires:
--    INSERT INTO user_profiles (id, tenant_id, status, full_name, email)
--    VALUES (gen_random_uuid(), '<tenant_uuid>', 'active', 'spam', 'spam@x');
--    -- ^ should RAISE 'TENANT_FULL' if tenant is at max_reps.
--    -- check policies:
--    SELECT tablename, policyname, cmd FROM pg_policies
--     WHERE tablename IN ('user_profiles','call_sessions','daily_stats','callbacks','leads')
--     ORDER BY tablename, cmd;
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
--  ROLLBACK (commented out — uncomment to revert to Week 0 state)
-- ═══════════════════════════════════════════════════════════
-- BEGIN;
--   DROP TRIGGER IF EXISTS user_profile_self_guard ON user_profiles;
--   DROP TRIGGER IF EXISTS enforce_max_reps ON user_profiles;
--   DROP FUNCTION IF EXISTS _user_profile_self_guard();
--   DROP FUNCTION IF EXISTS _enforce_max_reps();
--   DROP FUNCTION IF EXISTS _set_user_app_status(UUID,TEXT);
--   DROP FUNCTION IF EXISTS jwt_status();
--   DROP FUNCTION IF EXISTS is_active_session();
--   DROP FUNCTION IF EXISTS tenant_admin_list_reps(TEXT,UUID);
--   DROP FUNCTION IF EXISTS tenant_admin_delete_lead(TEXT,UUID);
--   -- Restore Week-0 policies:
--   DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
--   CREATE POLICY "Users can read own tenant profiles" ON user_profiles FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Users can manage own sessions (active)" ON call_sessions;
--   CREATE POLICY "Users can manage own sessions" ON call_sessions FOR ALL USING (user_id = auth.uid());
--   DROP POLICY IF EXISTS "Users can manage own callbacks (active)" ON callbacks;
--   CREATE POLICY "Users can manage own callbacks" ON callbacks FOR ALL USING (user_id = auth.uid());
--   -- (etc. — see migration_security_week0.sql for the previous policy set)
-- COMMIT;
