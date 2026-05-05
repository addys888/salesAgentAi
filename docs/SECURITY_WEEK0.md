# DialKaro — Week 0 Security Hardening (Rollout)

> **Why this exists**: closes the four critical/high pre-launch issues found in the security audit. After this rollout, the application-layer flows (Team Code → Manager Approval → Login) are backed by server-side enforcement instead of client-side hash checks.

---

## What changed

| Issue | Before | After |
|-------|--------|-------|
| **C1** | Anon could `INSERT`/`UPDATE` any tenant row | All tenant CRUD goes through `SECURITY DEFINER` RPCs gated by the platform super-hash stored in `platform_secrets`. Direct write access to `tenants` is revoked from `anon`/`authenticated`. |
| **C2** | `tenants.admin_hash`, `super_hash`, `webhook_secret` were anon-readable | Anon SELECT on `tenants` revoked. Public reads go through `public_tenants` view (no secrets). Admin/super RPCs return secrets only after verifying the typed-password hash. |
| **C3** | A permissive `user_profiles.UPDATE` policy was likely live in prod (admin actions otherwise wouldn't work) | Policy reset to `id = auth.uid()` only. All admin writes (approve/reject/suspend/specialty/subscription) go through tenant-admin RPCs that verify the typed-password hash matches the rep's tenant's `admin_hash`/`super_hash`. |
| **H1** | Pending registrations consumed slots — DoS the team code | Slot-count (registration gate **and** admin "Slots Used" badge) filters `status='active'`. New `tenant_active_rep_count(tenant_id)` RPC provides the canonical count. |

---

## Files touched

- **NEW** `supabase/migration_security_week0.sql` — apply in Supabase SQL Editor.
- **NEW** `docs/SECURITY_WEEK0.md` — this doc.
- **EDITED** `auth.js` — tenant lookups switched to `public_tenants`; admin/super logins call `verify_tenant_admin` / `verify_super_admin`; all mutating admin actions call the new RPCs; the typed-password hash is cached in `_currentAdminHash` / `_currentSuperHash` and cleared on logout / idle timeout.

No changes to `dialer.js`, `app.js`, `templates.js`, `index.html`, or any campaign / branding files. **All existing UI flows, branding, multi-tenant routing, dialer, webhooks, and templates remain functionally identical.**

---

## Deploy order

1. **Apply the migration** in Supabase SQL Editor:
   ```
   supabase/migration_security_week0.sql
   ```
   It's idempotent — safe to re-run. Rollback block is at the bottom of the file (commented out).

2. **Verify the lockdown** (run as `anon` from the SQL editor's `Run as` dropdown, or via curl with the anon key):
   ```sql
   SELECT id, app_name FROM public_tenants;       -- should return rows, no secrets
   SELECT admin_hash FROM tenants;                -- should fail: permission denied
   SELECT * FROM platform_secrets;                -- should fail: permission denied
   SELECT verify_super_admin('not-a-real-hash');  -- should return false
   ```

3. **Deploy the JS** (push `auth.js` to GitHub Pages). Hard-refresh after — the service worker caches aggressively.

4. **Smoke-test the four flows** below.

---

## Smoke tests

### A. Rep registers via Team Code (H1)

1. Visit `dialkaro.celerapps.com` → Sales Rep → Register.
2. Enter a known good Team Code → submit.
3. Console should log `[Tenant] Loaded: <name>` and the form should accept.
4. Repeat in another browser without approving the first — confirm the **second** registration **also** succeeds (because pending registrations no longer consume a slot).
5. Manager logs in → Approve both reps → confirm "Slots Used" reflects 2/N.

### B. Manager approves rep (C3)

1. As tenant admin, log in via Manager card.
2. Users tab → click ✅ Approve on a pending rep.
3. Should toast `✅ <Name> approved`. Verify by checking `user_profiles.status` for that row.
4. Try suspending → Activating → confirm round-trip works.

### C. Tenant admin sees webhook secret (C2)

1. As tenant admin, log in.
2. Go to Leads tab.
3. Webhook URL appears immediately. Webhook Secret should populate within a moment (RPC call).
4. If the secret shows `Unavailable — re-login as admin`, the cached admin hash was lost (e.g. timeout). Log out and back in.

### D. CelerApps super admin tenant CRUD (C1)

1. Triple-click footer → enter platform password → email OTP.
2. Tenants tab → confirm list loads with hashes / secrets visible (RPC returns full rows for super admin).
3. Add Tenant tab → fill form → Create. Confirm new tenant appears in the list.
4. Edit a Team Code inline → confirm toast and DB update.
5. Disable a tenant → re-enable → confirm.
6. 🔑 Reset PW → enter new password twice → confirm dialog shows new credentials.
7. Logout → confirm `_currentSuperHash` is cleared (try Tenants tab from a fresh load — should require re-login).

### E. Adversarial probe (verifies the lockdown)

```bash
ANON_KEY="<from auth.js line 78>"
SUPABASE_URL="https://dxxrcnsfmuqbgaixsbig.supabase.co"

# C1: try to insert a tenant directly — should FAIL
curl -i -X POST "$SUPABASE_URL/rest/v1/tenants" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"evil","admin_hash":"x","super_hash":"y","admin_username":"admin","hostname":"x","app_name":"x"}'
# Expect: 401/403 — RLS denies (or 404 if PostgREST hides the table).

# C2: try to read admin_hash directly — should FAIL
curl -i "$SUPABASE_URL/rest/v1/tenants?select=admin_hash" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# Expect: 401/403/404.

# C2 happy path: public_tenants returns safe columns only
curl -s "$SUPABASE_URL/rest/v1/public_tenants?select=*&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | head
# Expect: row with no admin_hash / super_hash / webhook_secret.
```

---

## Rotating the platform super-admin password

Previously: edit `CELERAPPS_SUPER_HASH` constant in `auth.js` and redeploy.

Now: a single SQL statement, no redeploy:
```sql
UPDATE platform_secrets
   SET value = '<new-sha256-hash>', updated_at = now()
 WHERE key = 'celerapps_super_hash';
```

Compute the hash:
```bash
echo -n 'new-platform-password-2026' | shasum -a 256 | awk '{print $1}'
```

---

## Backward compatibility

- **Tenant data**: untouched. The `tenants` table schema is unchanged; only RLS policies and grants changed.
- **Existing reps**: their `auth.users` rows and `user_profiles.tenant_id` are untouched. They continue to log in normally.
- **Existing webhooks**: continue to work. The Edge Function (`webhook-leads`) uses the `service_role` key, which bypasses RLS, so the lockdown is invisible to it.
- **Existing tenant admin passwords**: continue to work. The hash check moved from JS to a `SECURITY DEFINER` RPC, but the underlying `admin_hash` column is the same.

---

## What this does *not* fix (Week 1+ scope)

These remain on the punch list — see the audit summary for full detail:

- **C4** — pending status enforcement is still client-side; a determined attacker who intercepts the `signInWithPassword` JWT can act as a pending user. Fix: move status into `auth.users.app_metadata` and enforce in RLS.
- **H2** — no CAPTCHA on registration. Recommended: Cloudflare Turnstile + IP rate limit.
- **H3** — slot count race condition (two simultaneous registrations). Recommended: Postgres trigger.
- **H4** — `leads` UPDATE/DELETE allows any rep in the tenant to mutate any lead.
- **H5** — server-side platform-admin verification is now in place via `verify_super_admin`, but the email-OTP "trust this device" flag is still localStorage-based. Tighten in Week 2.
- **H6** — email enumeration on signup.
- **M1–M6** — webhook-secret rotation UI, audit log, idle-timeout hardening, payload size limits, re-registration cooldown, AI-proxy rate limit.

These are tracked in the recommended fix order documented in the audit.
