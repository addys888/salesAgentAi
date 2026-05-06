# DialKaro — Week 2 Security Hardening (Rollout)

> Run **after** Week 1. Closes the next four items on the audit punch list.
> Read together with [SECURITY_WEEK0.md](SECURITY_WEEK0.md) and [SECURITY_WEEK1.md](SECURITY_WEEK1.md).

---

## What changed

| Issue | Before | After |
|-------|--------|-------|
| **H5** | "Trust this device" was a localStorage key with an expiry timestamp. An attacker could DevTools-set `localStorage[__celer_super_trust_v1] = {exp: 9999999999999}` and bypass the OTP step. | The server issues a UUID token (`platform_trust_tokens` row) only after a successful OTP verification. JS keeps the UUID in localStorage. Each visit round-trips it through `super_admin_verify_trust_token` — a forged value with no matching row gets rejected. Logout revokes the token. |
| **M2** | Approve / reject / suspend / tenant-create / disable / max_reps changes / webhook rotation / login attempts were untracked. Hard to investigate any incident. | New append-only `audit_log` table + `_audit()` helper wired into every admin / super-admin RPC and into the `verify_tenant_admin` / `verify_super_admin` paths. New "📋 Audit Log" tab in the CelerApps super-admin console with filter (logins / tenant / rep / lead / webhook / trust). Per-tenant view available via `tenant_admin_recent_audit` RPC for future tenant-side use. |
| **M1** | Webhook secret was rotatable only by hand-editing the `tenants` row. If a secret leaked there was no in-product recovery. | New `tenant_admin_rotate_webhook_secret` RPC + 🔄 Rotate button in the admin Leads tab. Generates a fresh 24-byte hex secret, updates the row, audited. UI auto-reveals the new secret so the admin can copy it immediately. |
| **L5** | Admin login lockout was per-device (`_adminAttempts` JS counter). Incognito window → fresh counter, rate limit bypassed. | Server-side rate limit: `verify_tenant_admin` and `verify_super_admin` count `admin.login.fail` rows in `audit_log` for the username over the last 60 seconds and `RAISE 'rate_limited'` after 5. Lockout follows the username, not the device. |

---

## Files touched

- **NEW** [`supabase/migration_security_week2.sql`](../supabase/migration_security_week2.sql) — apply in Supabase SQL Editor (idempotent, rollback block at bottom).
- **NEW** `docs/SECURITY_WEEK2.md` — this doc.
- **EDITED** [`auth.js`](../auth.js):
  - H5: `isSuperDeviceTrusted` / `setSuperDeviceTrusted` are now async + server-backed; `superAdminLogin` awaits the verify; `superAdminLogout` revokes the token.
  - L5: rate-limit error from `verify_tenant_admin` / `verify_super_admin` surfaced as a friendly message.
  - M1: new `window.rotateWebhookSecret` handler.
  - M2: new `window.loadAuditLog` viewer + `audit` tab in `switchSuperTab`.
- **EDITED** [`index.html`](../index.html):
  - M1: 🔄 Rotate button + helper text in the webhook secret row.
  - M2: `📋 Audit Log` super-admin tab + table.

Untouched: `dialer.js`, `app.js`, `templates.js`, `styles.css`, branding, campaign assets, the `register-rep` Edge Function, all earlier migrations.

---

## Deploy order

### 1. Database migration

Open the Supabase SQL Editor → paste the contents of `supabase/migration_security_week2.sql` → **Run**.

Verify:
```sql
-- Tables created
SELECT count(*) FROM audit_log;             -- 0 OK
SELECT count(*) FROM platform_trust_tokens; -- 0 OK

-- New + replaced functions exist
SELECT proname FROM pg_proc
 WHERE proname IN (
   '_audit','_login_locked',
   'super_admin_issue_trust_token','super_admin_verify_trust_token','super_admin_revoke_trust_token',
   'tenant_admin_rotate_webhook_secret',
   'super_admin_recent_audit','tenant_admin_recent_audit'
 ) ORDER BY proname;
-- expect 8 rows

-- Lockout helper actually counts what it should
SELECT _login_locked('not-a-real-user');     -- false
SELECT verify_super_admin('not-a-real-hash');-- false (and writes one audit row)
SELECT count(*) FROM audit_log WHERE action = 'admin.login.fail';
-- expect ≥ 1
```

### 2. Frontend deploy

No Edge Function changes this week — just SQL + JS + HTML. After verifying the migration:

```sh
cd "/Users/adarsh/Documents/My Git/salesAgentAi"
git add auth.js index.html docs/SECURITY_WEEK2.md supabase/migration_security_week2.sql .claude/skills/dialkaro/SKILL.md
git commit -m "security(week-2): H5/M1/M2/L5 — server trust tokens, audit log, webhook rotation, server-side login lockout"
git push origin main
```

Hard-refresh `dialkaro.celerapps.com`.

---

## Smoke tests

### A. Audit log captures everything (M2)

1. Open the super-admin console (triple-click footer → password → OTP).
2. Click 📋 Audit Log → see at minimum `super.login.success` for the current login, plus an earlier `super.trust_token.issued` if you ticked "Trust this device".
3. Approve a pending rep from a tenant admin session → return to super admin → 📋 Audit Log → filter "Rep status changes" → see `rep.active` event with the rep's UUID.
4. Edit a tenant Team Code inline → see `tenant.update.team_code` event.

### B. Rate limit blocks across devices (L5)

1. From browser A: type the wrong tenant-admin password 5 times in a row.
2. Switch to browser B (incognito): try the **same username** with the **right** password → still blocked with `🔒 Too many failed attempts on this username. Try again in ~60 seconds.`
3. Wait 60s → retry → succeeds.
4. Audit log shows 5× `admin.login.fail` then 1× `admin.login.locked` then 1× `admin.login.success`.

### C. Trust-device tampering rejected (H5)

1. Log in as super admin with "Trust this device" checked → the second login (within 7 days) should skip OTP.
2. Log out → in DevTools, re-set `localStorage.__celer_super_trust_v1 = JSON.stringify({token:'00000000-0000-0000-0000-000000000000'})`.
3. Reload → triple-click footer → password → **OTP is required again** (server says the token doesn't exist).
4. Try a forged-shape value: `localStorage.setItem('__celer_super_trust_v1', '{}')` → same — OTP required.

### D. Webhook rotation (M1)

1. Log in as tenant admin → Leads tab.
2. Click 🔄 Rotate → confirm.
3. Toast `🔄 Webhook secret rotated` + the secret field auto-reveals the new value. Old integrations now return 401 from the `webhook-leads` Edge Function.
4. Audit log shows `tenant.webhook_secret.rotated` for that tenant.

### E. Adversarial probes

```bash
ANON_KEY="<from auth.js>"
URL="https://dxxrcnsfmuqbgaixsbig.supabase.co"

# Try to read the audit log directly — should FAIL (RLS denies anon)
curl -i "$URL/rest/v1/audit_log?select=*" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# Expect: 401/403/404

# Try to issue a trust token without the super hash — should FAIL
curl -i -X POST "$URL/rest/v1/rpc/super_admin_issue_trust_token" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_super_hash":"deadbeef"}'
# Expect: 401 with "unauthorized"

# Try to bulk-fail logins to deliberately lock out 'admin' — should write
# audit rows then start RAISE'ing rate_limited:
for i in 1 2 3 4 5 6; do
  curl -s -X POST "$URL/rest/v1/rpc/verify_tenant_admin" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"p_username":"admin","p_hash":"0000000000000000000000000000000000000000000000000000000000000000"}'
  echo
done
# Expect: rows 1-5 return [], row 6 returns "rate_limited" error.
```

---

## Behavior changes worth knowing

1. **`isSuperDeviceTrusted` is now async.** If you later add other call sites (e.g. an "Are you the platform admin?" check before showing a button), `await` it.

2. **Logout now does an async revoke.** The `superAdminLogout` button calls `super_admin_revoke_trust_token` — fast (~50ms) but does fire a network call.

3. **Existing localStorage trust flags are auto-invalidated.** Old entries had `{exp: <timestamp>}` shape; new code reads `{token: <uuid>}`. The first visit after the JS deploy treats any pre-Week-2 flag as untrusted and re-prompts for OTP. Acceptable one-time UX hit.

4. **Audit log retention is unbounded.** Schema-wise, rows accumulate forever. At ~100 events/day the table stays small for years; at 10k events/day you'll want a 90-day pruning cron. Add to Week-3 backlog.

5. **Login lockout is per-username, 60-second window, 5-fail threshold.** A determined attacker can lock out a real user by burning 5 fails on their username. The `audit_log` makes this visible (`admin.login.locked` rows) — you'll see it. Not a regression vs. the per-device counter, just a new shape of pressure. If it becomes a problem, add an IP-based grace path.

6. **`super_admin_create_tenant`, `super_admin_update_tenant`, `tenant_admin_*`, `tenant_admin_rotate_webhook_secret`** all now write audit rows. Surface `_audit` failures don't fail the parent operation (the INSERT is part of the same transaction as the parent change, but Postgres rolls both back together if either fails — that's correct behavior).

---

## What still needs Week 3+

- Force JWT revocation when an admin suspends an active rep (currently the rep keeps their JWT for up to 1 hour).
- Move `user_profiles` / `daily_stats` / `leads` SELECT off `USING(true)` and behind admin RPCs.
- Cron to prune `audit_log` rows older than N days (90?).
- Cron to flip expired-subscription users to `suspended` server-side (Week-1 noted this as a follow-up).
- Tenant-side audit log viewer (the `tenant_admin_recent_audit` RPC is ready; just no UI for it yet).
- Cooldown column on rejected-user re-registration (currently hard-blocked).
- IP-based rate limiting on the `register-rep` Edge Function (currently relies on Turnstile only).
