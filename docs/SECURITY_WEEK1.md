# DialKaro — Week 1 Security Hardening (Rollout)

> Run **after** Week 0. Closes the four next items on the audit punch list.
> Read together with [SECURITY_WEEK0.md](SECURITY_WEEK0.md).

---

## What changed

| Issue | Before | After |
|-------|--------|-------|
| **C4** | Rep status was checked client-side after `signInWithPassword` succeeded. A pending/rejected rep with the resulting JWT could call any RLS-permitted endpoint. | Status now lives in `auth.users.raw_app_meta_data.status` and rides inside the JWT. Operational tables (`call_sessions`, `callbacks`, `leads` write) require `is_active_session()` in RLS. Pending reps with a valid JWT can no longer write. A trigger (`_user_profile_self_guard`) blocks reps from changing their own `status`/`tenant_id`/`subscription_end`/`specialty`. |
| **H3** | Slot count race: two concurrent activations could both pass the JS check and exceed `tenants.max_reps`. | Postgres trigger (`_enforce_max_reps`) on `user_profiles` BEFORE INSERT/UPDATE OF status raises `TENANT_FULL` if activating would exceed the cap. |
| **H4** | `leads` UPDATE allowed any rep in the tenant to mutate any lead; DELETE allowed any rep to wipe leads. | UPDATE restricted to `assigned_to = auth.uid() AND is_active_session()`. Direct DELETE removed; tenant admins use the new `tenant_admin_delete_lead` RPC. |
| **H2** | Rep registration hit `auth.signUp` directly with no anti-bot. Leaked Team Code → unlimited fake registrations. | Registration goes through a new `register-rep` Edge Function that verifies a Cloudflare Turnstile token, performs the active-only slot check, and creates the user via `auth.admin.createUser` with `app_metadata.status='pending'` (so the JWT immediately satisfies the C4 RLS policies once approved). |

---

## Files touched

- **NEW** [`supabase/migration_security_week1.sql`](../supabase/migration_security_week1.sql) — apply in Supabase SQL Editor (idempotent, rollback block at bottom).
- **NEW** [`supabase/functions/register-rep/index.ts`](../supabase/functions/register-rep/index.ts) — Edge Function for Turnstile-gated registration. Deploy via `supabase functions deploy register-rep`.
- **NEW** `docs/SECURITY_WEEK1.md` — this doc.
- **EDITED** [`auth.js`](../auth.js) — `userRegister` now calls the Edge Function with a Turnstile token; `loadUsers` reads via `tenant_admin_list_reps` RPC; Turnstile widget lifecycle helpers; constants for `TURNSTILE_SITE_KEY`.
- **EDITED** [`index.html`](../index.html) — Turnstile script tag in `<head>`, widget container above the Create Account button.

Untouched: `dialer.js`, `app.js`, `templates.js`, `styles.css`, branding, campaign assets, other migrations.

---

## Deploy order

This is more involved than Week 0 because of the Edge Function and Cloudflare setup. **Three rollouts**, each independently safe:

### 1. Cloudflare Turnstile setup (one-time, ~3 min)

1. Sign in at <https://dash.cloudflare.com/?to=/:account/turnstile>.
2. Click **Add site** → name it `dialkaro` → set domain to `dialkaro.celerapps.com` → widget mode **Managed**.
3. Copy:
   - **Site key** → goes into `auth.js` (constant `TURNSTILE_SITE_KEY`)
   - **Secret key** → goes into Supabase Edge Function env vars (next step)

If you skip this step, registration still works — both the JS and Edge Function detect the unset keys and skip CAPTCHA verification (with a console warning). You can wire CAPTCHA in later without redeploying anything else.

### 2. Database migration (run in Supabase SQL Editor)

Paste the contents of `supabase/migration_security_week1.sql` and run. Verify with:
```sql
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'user_profiles'::regclass AND tgname IN ('user_profile_self_guard','enforce_max_reps');
-- expect 2 rows

SELECT proname FROM pg_proc
 WHERE proname IN ('is_active_session','jwt_status','tenant_admin_list_reps','tenant_admin_delete_lead','_set_user_app_status');
-- expect 5 rows

SELECT (raw_app_meta_data->>'status') AS status, count(*)
  FROM auth.users GROUP BY 1;
-- expect rows like {active, pending, suspended, rejected} reflecting current user_profiles
```

### 3. Edge Function deploy

You need the **Supabase CLI** locally:
```sh
# install once:
brew install supabase/tap/supabase
# or
npm install -g supabase

# from the repo root:
supabase login                                     # one-time
supabase link --project-ref dxxrcnsfmuqbgaixsbig   # one-time
supabase functions deploy register-rep             # the deploy
```

If you have the Turnstile **secret** key:
```sh
supabase secrets set TURNSTILE_SECRET=<paste-secret-here>
```
You can also do this from the Supabase dashboard: Project → Edge Functions → register-rep → Secrets.

If you don't set `TURNSTILE_SECRET`, the Edge Function logs a warning and lets registrations through without CAPTCHA verification. Same fail-open behavior as the JS — useful before keys are ready.

### 4. Frontend deploy

1. Open `auth.js`, replace `TURNSTILE_SITE_KEY = 'REPLACE_WITH_YOUR_TURNSTILE_SITE_KEY'` with the real site key from step 1 (or leave the placeholder if not ready — widget stays hidden).
2. `git add . && git commit -m "security(week-1): C4/H2/H3/H4 — JWT status, Turnstile, max_reps trigger, leads tightening" && git push`
3. Hard-refresh `dialkaro.celerapps.com` to bust the SW cache.

---

## Smoke tests

### A. Pending rep can't act (C4)

1. Register a new rep via Team Code (don't approve yet).
2. Try to log in as that rep — should be blocked by the existing client-side `status='pending'` check.
3. **Adversarial probe** (proves C4 is server-side, not just UI):
   ```bash
   # Manually obtain a JWT for the pending rep
   curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
     -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
     -d "{\"email\":\"pending-rep@test.com\",\"password\":\"...\"}" \
     | jq -r .access_token > /tmp/pending.jwt

   # Try to write a callback with this JWT — should FAIL with 401/403
   curl -i -X POST "$SUPABASE_URL/rest/v1/callbacks" \
     -H "apikey: $ANON_KEY" \
     -H "Authorization: Bearer $(cat /tmp/pending.jwt)" \
     -H "Content-Type: application/json" \
     -d '{"contact_name":"x","contact_number":"9999999999","callback_date":"2026-12-31","status":"pending"}'
   # Expect: 401 — RLS is_active_session() rejects.
   ```
4. As tenant admin, approve the rep. Now they log in → `app_metadata.status='active'` is in the new JWT → all operations work.

### B. Self status-tampering blocked (C4 trigger)

After login as an active rep, try to escalate yourself in DevTools console:
```js
await window._sb.from('user_profiles').update({status:'pending'}).eq('id', currentUser.id)
// Expect: error "cannot change status directly — ask your manager"
```

### C. Race condition blocked (H3)

In Supabase SQL Editor, simulate two concurrent activations:
```sql
-- assume tenant has max_reps=2 and 1 active rep already
BEGIN;
  UPDATE user_profiles SET status='active' WHERE id='<pending-rep-1>';
  -- intentionally leave open
ROLLBACK;
-- meanwhile in another query window:
UPDATE user_profiles SET status='active' WHERE id='<pending-rep-2>';
-- the second one should ERROR: TENANT_FULL
```

### D. Leads UPDATE/DELETE locked (H4)

As a logged-in rep:
```js
// Try to update someone ELSE's lead in the same tenant — should FAIL
await window._sb.from('leads').update({status:'invalid'}).eq('id','<other-reps-lead-id>')
// Expect: 0 rows updated (RLS rejects)

// Try to DELETE — should fail (no policy permits direct DELETE for reps)
await window._sb.from('leads').delete().eq('id','<own-lead-id>')
// Expect: 0 rows
```

Tenant admin can still delete via the RPC:
```js
await window._sb.rpc('tenant_admin_delete_lead', {
  p_admin_hash: window._currentAdminHash,
  p_lead_id: '<lead-uuid>'
})
```

### E. Turnstile gate (H2)

1. With `TURNSTILE_SITE_KEY` set: open Register tab → CAPTCHA widget appears → solve → submit.
2. With it unset (placeholder): register normally without CAPTCHA (Edge Function logs `TURNSTILE_SECRET unset — skipping CAPTCHA (insecure)`).
3. **Adversarial probe** — direct `auth.signUp` from console should NOT create a usable account anymore (since RLS now requires `app_metadata.status='active'` for operations, and signUp doesn't set that):
   ```js
   await window._sb.auth.signUp({email:'attacker@test.com',password:'12345678'})
   // signUp succeeds, but the user has no user_profile and app_metadata.status is unset →
   // they can read the public landing page only. Useful for the email-confirmation flow,
   // not for registration.
   ```

---

## Behavior changes you should know about

1. **Re-registration of rejected users no longer auto-flips them back to pending.** Previously a rejected rep could log in with their old creds and the upsert would re-set their status. Now the Edge Function detects `status='rejected'` and returns `403 — Please contact your manager`. **This is desired behavior** (a manager rejected them for a reason), but expect at least one support ticket.

2. **Self-suspend on expired subscription is now best-effort.** The `_user_profile_self_guard` trigger blocks the client-side `update({status:'suspended'}).eq('id', currentUser.id)` calls in the auto-login / login subscription-check paths. The error is caught and ignored — the user is still signed out, and the next login attempt is blocked by the subscription-end check. **The cosmetic effect** (admin sees "suspended" status) is lost. Schedule a Postgres cron job to flip expired reps to suspended (Week 2 followup).

3. **JWT app_metadata is set at login time.** When a tenant admin approves a rep, `tenant_admin_update_rep_status` updates both `user_profiles.status` and `auth.users.raw_app_meta_data.status`. But the rep's existing JWT (if any) is unchanged — they need to log in again to get a fresh JWT carrying `app_metadata.status='active'`. **Acceptable** for the approve flow (they were never logged in).

4. **An active rep who gets suspended retains their JWT for up to 1 hour** (default JWT lifetime). For 1 hour after suspension they can keep operating. To force immediate revocation, call `auth.admin.signOut(userId)` from an Edge Function. (Week-2 followup — not a Week-1 blocker.)

5. **`user_profiles` and `daily_stats` SELECTs are still permissive (`USING(true)`).** This is intentional so the admin/super-admin tabs (which run as anon, no JWT) keep reading. Privacy on user phone/email + cross-tenant leaderboard scrubbing is on the Week-2 list, not a Week-1 blocker.

---

## What still needs Week 2+

- **C4 followup** — JWT TTL on suspension (force `auth.admin.signOut` for suspended users).
- **C4 cleanup** — move `user_profiles` / `daily_stats` / `leads` SELECT off `USING(true)` and behind admin RPCs (`tenant_admin_list_reps` already exists; add similar for `daily_stats` + `leads`).
- **M1** — webhook-secret rotation UI.
- **M2** — audit log on tenant + admin actions.
- **M5** — cooldown on rejected-user re-registration (currently hard-blocked).
- **L5** — server-side admin login lockout (currently per-device).

Track in the Week-2 doc when you start that batch.
