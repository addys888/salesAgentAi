-- ═══════════════════════════════════════════════════════════
--  WEEK 2 SECURITY HARDENING — DialKaro
--
--  Run AFTER migration_security_week1.sql.
--
--  Fixes (see docs/SECURITY_WEEK2.md):
--    H5 — Replace the localStorage trust-device flag with server-issued
--         UUID tokens stored in platform_trust_tokens. JS can no longer
--         forge "trusted device" status to skip OTP.
--    M2 — Append-only audit_log table + _audit() helper, wired into
--         every admin/super-admin RPC. Super-admin console gets a
--         super_admin_recent_audit() view.
--    M1 — tenant_admin_rotate_webhook_secret RPC (admin/super-hash gated)
--         lets a tenant manager rotate their secret from the Leads tab UI.
--    L5 — Server-side admin login rate-limit. verify_tenant_admin and
--         verify_super_admin track failed attempts in audit_log and lock
--         the username for 60s after 5 fails. Lockout is now per-username,
--         not per-device — incognito windows can't bypass it.
--
--  Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- 1. M2 — AUDIT LOG (append-only)
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  event_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_kind   TEXT NOT NULL,           -- 'celerapps_super' | 'tenant_admin' | 'tenant_super' | 'webhook' | 'system'
  actor_label  TEXT,                    -- e.g. 'admin' (tenant admin username)
  tenant_id    UUID,                    -- nullable for cross-tenant events
  action       TEXT NOT NULL,           -- 'tenant.create', 'rep.approve', 'admin.login.fail', etc.
  target_kind  TEXT,                    -- 'tenant' | 'user_profile' | 'lead' | 'admin_username' | NULL
  target_id    TEXT,                    -- text so it can hold UUIDs OR usernames
  payload      JSONB,                   -- arbitrary structured detail
  ip           TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_event_at ON audit_log(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tenant   ON audit_log(tenant_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_log(action, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target   ON audit_log(target_id, event_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- No public policies = inaccessible from anon/authenticated.
-- Reads go through super_admin_recent_audit / tenant_admin_recent_audit RPCs.
REVOKE ALL ON audit_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE audit_log_id_seq FROM anon, authenticated;

-- Internal append helper. Callable only from SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION _audit(
  p_actor_kind  TEXT,
  p_actor_label TEXT,
  p_tenant_id   UUID,
  p_action      TEXT,
  p_target_kind TEXT,
  p_target_id   TEXT,
  p_payload     JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log
    (actor_kind, actor_label, tenant_id, action, target_kind, target_id, payload)
  VALUES
    (p_actor_kind, p_actor_label, p_tenant_id, p_action, p_target_kind, p_target_id, p_payload);
END $$;
REVOKE ALL ON FUNCTION _audit(TEXT,TEXT,UUID,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────
-- 2. L5 — LOGIN LOCKOUT HELPER
--    Counts 'admin.login.fail' rows in the last 60s for a given
--    target_id (the admin_username). Used by both verify_tenant_admin
--    and verify_super_admin.
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION _login_locked(p_target TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*) >= 5
    FROM audit_log
   WHERE action = 'admin.login.fail'
     AND target_id = p_target
     AND event_at > now() - INTERVAL '60 seconds';
$$;
REVOKE ALL ON FUNCTION _login_locked(TEXT) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────
-- 3. H5 — SERVER-ISSUED TRUST TOKENS
--    Replaces the forge-able localStorage flag.
--    After OTP success + "trust this device" checkbox, the server
--    generates a UUID and stores it with an expiry. JS keeps the UUID
--    in localStorage. Future visits round-trip the UUID through
--    super_admin_verify_trust_token(); JS can't forge an entry that
--    doesn't exist in the table.
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_trust_tokens (
  token       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expires_at  TIMESTAMPTZ NOT NULL,
  device_hint TEXT,                    -- optional: User-Agent or similar
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_trust_expiry
  ON platform_trust_tokens(expires_at);

ALTER TABLE platform_trust_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_trust_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION super_admin_issue_trust_token(
  p_super_hash  TEXT,
  p_days        INT DEFAULT 7,
  p_device_hint TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token UUID;
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_days < 1 OR p_days > 30 THEN p_days := 7; END IF;

  -- Lazy cleanup: drop expired tokens whenever we issue a new one
  DELETE FROM platform_trust_tokens WHERE expires_at < now();

  INSERT INTO platform_trust_tokens (expires_at, device_hint)
  VALUES (now() + (p_days || ' days')::INTERVAL, p_device_hint)
  RETURNING token INTO new_token;

  PERFORM _audit('celerapps_super', NULL, NULL,
                 'super.trust_token.issued', 'token', new_token::text,
                 jsonb_build_object('days', p_days, 'device_hint', p_device_hint));
  RETURN new_token;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_issue_trust_token(TEXT,INT,TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION super_admin_verify_trust_token(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE found BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM platform_trust_tokens
     WHERE token = p_token AND expires_at > now()
  ) INTO found;
  RETURN found;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_verify_trust_token(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION super_admin_revoke_trust_token(p_token UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM platform_trust_tokens WHERE token = p_token;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_revoke_trust_token(UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 4. L5 + M2 — REPLACE verify_tenant_admin + verify_super_admin
--    with rate-limit + audit-log instrumentation.
-- ────────────────────────────────────────

DROP FUNCTION IF EXISTS verify_tenant_admin(TEXT, TEXT);
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
DECLARE
  matched_tenant RECORD;
  is_super_match BOOLEAN := FALSE;
BEGIN
  -- L5: server-side rate limit (per-username, 60s window).
  IF _login_locked(p_username) THEN
    PERFORM _audit('tenant_admin', p_username, NULL,
                   'admin.login.locked', 'admin_username', p_username, NULL);
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '42501';
  END IF;

  SELECT t.* INTO matched_tenant
    FROM tenants t
   WHERE t.admin_username = p_username
     AND t.is_active = TRUE
     AND (t.admin_hash = p_hash OR t.super_hash = p_hash)
   LIMIT 1;

  IF NOT FOUND THEN
    PERFORM _audit('tenant_admin', p_username, NULL,
                   'admin.login.fail', 'admin_username', p_username, NULL);
    RETURN;  -- empty result set = caller treats as failure
  END IF;

  is_super_match := (matched_tenant.super_hash = p_hash);

  PERFORM _audit('tenant_admin', p_username, matched_tenant.id,
                 'admin.login.success', 'tenant', matched_tenant.id::text,
                 jsonb_build_object('is_super', is_super_match));

  RETURN QUERY
  SELECT matched_tenant.id, matched_tenant.slug, matched_tenant.hostname,
         matched_tenant.app_name, matched_tenant.app_subtitle, matched_tenant.app_emoji,
         matched_tenant.landing_title, matched_tenant.landing_tagline, matched_tenant.primary_color,
         matched_tenant.admin_username, matched_tenant.max_reps,
         matched_tenant.subscription_end, matched_tenant.is_active,
         matched_tenant.team_code, is_super_match;
END $$;
GRANT EXECUTE ON FUNCTION verify_tenant_admin(TEXT,TEXT) TO anon, authenticated;

DROP FUNCTION IF EXISTS verify_super_admin(TEXT);
CREATE OR REPLACE FUNCTION verify_super_admin(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- The "username" we rate-limit on for the platform admin is a fixed sentinel
  PLATFORM_USER CONSTANT TEXT := '__celerapps_super__';
BEGIN
  IF _login_locked(PLATFORM_USER) THEN
    PERFORM _audit('celerapps_super', NULL, NULL,
                   'admin.login.locked', 'admin_username', PLATFORM_USER, NULL);
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '42501';
  END IF;

  IF _is_celerapps_super(p_hash) THEN
    PERFORM _audit('celerapps_super', NULL, NULL,
                   'super.login.success', 'admin_username', PLATFORM_USER, NULL);
    RETURN TRUE;
  ELSE
    PERFORM _audit('celerapps_super', NULL, NULL,
                   'admin.login.fail', 'admin_username', PLATFORM_USER, NULL);
    RETURN FALSE;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION verify_super_admin(TEXT) TO anon, authenticated;

-- ────────────────────────────────────────
-- 5. M2 — INSTRUMENT EXISTING ADMIN/SUPER-ADMIN RPCs WITH AUDIT
--    Drop + recreate (signatures unchanged so existing JS still works).
-- ────────────────────────────────────────

-- super_admin_create_tenant + audit
DROP FUNCTION IF EXISTS super_admin_create_tenant(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,DATE,BOOLEAN
);
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
  p_super_hash_local TEXT,
  p_max_reps         INT,
  p_subscription_end DATE,
  p_is_active        BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  PERFORM _audit('celerapps_super', NULL, new_id, 'tenant.create',
                 'tenant', new_id::text,
                 jsonb_build_object(
                   'slug', p_slug, 'app_name', p_app_name,
                   'team_code', p_team_code, 'max_reps', p_max_reps,
                   'subscription_end', p_subscription_end));
  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_create_tenant(
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,DATE,BOOLEAN
) TO anon, authenticated;

-- super_admin_update_tenant + audit
DROP FUNCTION IF EXISTS super_admin_update_tenant(TEXT, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION super_admin_update_tenant(
  p_super_hash TEXT,
  p_tenant_id  UUID,
  p_field      TEXT,
  p_value      TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_field NOT IN (
    'team_code','max_reps','admin_username','subscription_end',
    'is_active','app_name','app_subtitle','app_emoji',
    'landing_title','landing_tagline','primary_color','admin_hash','hostname'
  ) THEN RAISE EXCEPTION 'invalid field: %', p_field; END IF;
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

  -- Don't log admin_hash values to audit (sensitive).
  PERFORM _audit('celerapps_super', NULL, p_tenant_id,
                 'tenant.update.' || p_field,
                 'tenant', p_tenant_id::text,
                 jsonb_build_object('field', p_field,
                                    'value', CASE WHEN p_field = 'admin_hash'
                                                   THEN '<redacted>'
                                                   ELSE p_value END));
END $$;
GRANT EXECUTE ON FUNCTION super_admin_update_tenant(TEXT,UUID,TEXT,TEXT) TO anon, authenticated;

-- tenant_admin_update_rep_status + audit (preserves Week-1 sync to app_metadata)
DROP FUNCTION IF EXISTS tenant_admin_update_rep_status(TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION tenant_admin_update_rep_status(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_new_status TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE rep_tenant UUID;
BEGIN
  IF p_new_status NOT IN ('active','suspended','rejected','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF NOT _admin_owns_rep(p_admin_hash, p_rep_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT tenant_id INTO rep_tenant FROM user_profiles WHERE id = p_rep_id;
  UPDATE user_profiles SET status = p_new_status WHERE id = p_rep_id;
  PERFORM _set_user_app_status(p_rep_id, p_new_status);
  PERFORM _audit('tenant_admin', NULL, rep_tenant,
                 'rep.' || p_new_status,
                 'user_profile', p_rep_id::text,
                 jsonb_build_object('new_status', p_new_status));
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_update_rep_status(TEXT,UUID,TEXT) TO anon, authenticated;

-- tenant_admin_set_rep_specialty + audit
DROP FUNCTION IF EXISTS tenant_admin_set_rep_specialty(TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION tenant_admin_set_rep_specialty(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_specialty  TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rep_tenant UUID;
BEGIN
  IF NOT _admin_owns_rep(p_admin_hash, p_rep_id) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  SELECT tenant_id INTO rep_tenant FROM user_profiles WHERE id = p_rep_id;
  UPDATE user_profiles SET specialty = NULLIF(TRIM(p_specialty),'') WHERE id = p_rep_id;
  PERFORM _audit('tenant_admin', NULL, rep_tenant,
                 'rep.specialty', 'user_profile', p_rep_id::text,
                 jsonb_build_object('specialty', NULLIF(TRIM(p_specialty),'')));
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_rep_specialty(TEXT,UUID,TEXT) TO anon, authenticated;

-- tenant_admin_set_rep_subscription + audit
DROP FUNCTION IF EXISTS tenant_admin_set_rep_subscription(TEXT, UUID, DATE);
CREATE OR REPLACE FUNCTION tenant_admin_set_rep_subscription(
  p_admin_hash TEXT,
  p_rep_id     UUID,
  p_sub_end    DATE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
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
  PERFORM _audit('tenant_super', NULL, rep_tenant,
                 'rep.subscription', 'user_profile', p_rep_id::text,
                 jsonb_build_object('subscription_end', p_sub_end,
                                    'new_status', new_status));
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_rep_subscription(TEXT,UUID,DATE) TO anon, authenticated;

-- tenant_admin_set_max_reps + audit
DROP FUNCTION IF EXISTS tenant_admin_set_max_reps(TEXT, UUID, INT);
CREATE OR REPLACE FUNCTION tenant_admin_set_max_reps(
  p_admin_hash TEXT,
  p_tenant_id  UUID,
  p_max_reps   INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_max_reps IS NULL OR p_max_reps < 1 OR p_max_reps > 500 THEN
    RAISE EXCEPTION 'invalid max_reps';
  END IF;
  IF NOT _admin_is_super_for_tenant(p_admin_hash, p_tenant_id) THEN
    RAISE EXCEPTION 'unauthorized: super admin only' USING ERRCODE = '42501';
  END IF;
  UPDATE tenants SET max_reps = p_max_reps WHERE id = p_tenant_id;
  PERFORM _audit('tenant_super', NULL, p_tenant_id,
                 'tenant.max_reps', 'tenant', p_tenant_id::text,
                 jsonb_build_object('max_reps', p_max_reps));
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_set_max_reps(TEXT,UUID,INT) TO anon, authenticated;

-- tenant_admin_delete_lead + audit
DROP FUNCTION IF EXISTS tenant_admin_delete_lead(TEXT, UUID);
CREATE OR REPLACE FUNCTION tenant_admin_delete_lead(
  p_admin_hash TEXT,
  p_lead_id    UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lead_tenant UUID; lead_phone TEXT;
BEGIN
  SELECT tenant_id, phone INTO lead_tenant, lead_phone
    FROM leads WHERE id = p_lead_id;
  IF lead_tenant IS NULL THEN RAISE EXCEPTION 'lead not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenants
     WHERE id = lead_tenant
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  DELETE FROM leads WHERE id = p_lead_id;
  PERFORM _audit('tenant_admin', NULL, lead_tenant,
                 'lead.delete', 'lead', p_lead_id::text,
                 jsonb_build_object('phone', lead_phone));
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_delete_lead(TEXT,UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 6. M1 — TENANT WEBHOOK SECRET ROTATION
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION tenant_admin_rotate_webhook_secret(
  p_admin_hash TEXT,
  p_tenant_id  UUID
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_secret TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenants
     WHERE id = p_tenant_id
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  new_secret := encode(gen_random_bytes(24), 'hex');
  UPDATE tenants SET webhook_secret = new_secret WHERE id = p_tenant_id;
  PERFORM _audit('tenant_admin', NULL, p_tenant_id,
                 'tenant.webhook_secret.rotated',
                 'tenant', p_tenant_id::text, NULL);
  RETURN new_secret;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_rotate_webhook_secret(TEXT,UUID) TO anon, authenticated;

-- ────────────────────────────────────────
-- 7. M2 — AUDIT VIEW RPCs
-- ────────────────────────────────────────

-- For the CelerApps platform admin: cross-tenant feed
CREATE OR REPLACE FUNCTION super_admin_recent_audit(
  p_super_hash TEXT,
  p_limit      INT DEFAULT 200
) RETURNS SETOF audit_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _is_celerapps_super(p_super_hash) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 200; END IF;
  IF p_limit > 1000 THEN p_limit := 1000; END IF;
  RETURN QUERY
  SELECT * FROM audit_log ORDER BY event_at DESC LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION super_admin_recent_audit(TEXT,INT) TO anon, authenticated;

-- For a tenant admin: their tenant's events only
CREATE OR REPLACE FUNCTION tenant_admin_recent_audit(
  p_admin_hash TEXT,
  p_tenant_id  UUID,
  p_limit      INT DEFAULT 200
) RETURNS SETOF audit_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tenants
     WHERE id = p_tenant_id
       AND (admin_hash = p_admin_hash OR super_hash = p_admin_hash)
       AND is_active = TRUE
  ) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 200; END IF;
  IF p_limit > 1000 THEN p_limit := 1000; END IF;
  RETURN QUERY
  SELECT * FROM audit_log
   WHERE tenant_id = p_tenant_id
   ORDER BY event_at DESC LIMIT p_limit;
END $$;
GRANT EXECUTE ON FUNCTION tenant_admin_recent_audit(TEXT,UUID,INT) TO anon, authenticated;

-- ────────────────────────────────────────
-- 8. SCHEMA RELOAD
-- ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════
--  VERIFICATION
--    SELECT count(*) FROM audit_log;     -- new table, 0+ rows
--    SELECT * FROM platform_trust_tokens;-- empty until first OTP success
--    -- Trigger a fail and see audit row land:
--    SELECT verify_super_admin('not-a-real-hash');  -- false
--    SELECT * FROM audit_log ORDER BY event_at DESC LIMIT 1;
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
--  ROLLBACK (commented; uncomment to revert to Week 1 state)
-- ═══════════════════════════════════════════════════════════
-- BEGIN;
--   DROP FUNCTION IF EXISTS super_admin_recent_audit(TEXT,INT);
--   DROP FUNCTION IF EXISTS tenant_admin_recent_audit(TEXT,UUID,INT);
--   DROP FUNCTION IF EXISTS tenant_admin_rotate_webhook_secret(TEXT,UUID);
--   DROP FUNCTION IF EXISTS super_admin_issue_trust_token(TEXT,INT,TEXT);
--   DROP FUNCTION IF EXISTS super_admin_verify_trust_token(UUID);
--   DROP FUNCTION IF EXISTS super_admin_revoke_trust_token(UUID);
--   DROP FUNCTION IF EXISTS _login_locked(TEXT);
--   DROP FUNCTION IF EXISTS _audit(TEXT,TEXT,UUID,TEXT,TEXT,TEXT,JSONB);
--   DROP TABLE IF EXISTS platform_trust_tokens;
--   DROP TABLE IF EXISTS audit_log;
--   -- (verify_tenant_admin / verify_super_admin / other RPCs are restored
--   --  by re-running migration_security_week0.sql + week1.sql, which are
--   --  idempotent.)
-- COMMIT;
