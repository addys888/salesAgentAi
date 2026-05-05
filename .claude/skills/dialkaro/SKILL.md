---
name: dialkaro
description: Expert guidance for the DialKaro project — a multi-tenant sales dialer SaaS by CelerApps. Covers architecture (vanilla JS + Supabase + GitHub Pages), 4-tier auth model (rep / tenant admin / tenant super admin / CelerApps platform admin), tenant routing by hostname / team code / admin password, the dialer engine (Excel/CSV upload → call → tag outcome → AI summary), webhook lead auto-capture with specialty-based round-robin routing, callback scheduling, subscription enforcement, and the sales/onboarding playbooks. Use when editing any file in this repo, debugging multi-tenant flows, adding features, onboarding clients, or shipping campaign material.
---

# DialKaro — Project Skill

DialKaro is a **multi-tenant sales dialer SaaS** by CelerApps, hosted at [dialkaro.celerapps.com](https://dialkaro.celerapps.com). One codebase, one Supabase project, many tenants.

## Core principles for editing this codebase

1. **No build step, no framework.** Pure HTML / vanilla JS / CSS served from GitHub Pages. Don't introduce Webpack, Vite, React, TypeScript transpilation, or npm dependencies. CDN script tags only (XLSX, jsPDF, Chart.js, EmailJS).
2. **Safe DOM, never `innerHTML` with user data.** The codebase uses `document.createElement` + `textContent` everywhere user data is rendered (search for `// Safe DOM` comments). Preserve that pattern when editing — it's the XSS defense.
3. **Multi-tenant isolation is non-negotiable.** Every query that touches `user_profiles`, `call_sessions`, `daily_stats`, `callbacks`, or `leads` MUST filter by `currentTenant.id` when one is loaded. Search for `if (currentTenant) query = query.eq('tenant_id', currentTenant.id)` for the pattern.
4. **SHA-256 password hashing** is done client-side via `crypto.subtle.digest`. Plaintext passwords never reach the database. The `sha256()` helper lives at the top of [auth.js](../../../auth.js).
5. **GitHub Pages caches aggressively.** When testing changes locally with the live Supabase, hard-refresh (`Cmd+Shift+R`). The service worker also caches — version bumps via `Date.now()` on each load.

## Repository map

```
salesAgentAi/
├── index.html           907 lines — single-page app shell, all screens (landing, auth, dialer, admin, super admin)
├── styles.css           632 lines — dark theme + light theme via [data-theme]
├── app.js               255 lines — modals, toasts, theme, keyboard shortcuts, PWA manifest + SW
├── auth.js             2691 lines — Supabase init, tenant loading, auth (rep/admin/super admin), admin panel, super admin panel
├── dialer.js           1702 lines — Excel/CSV parser, dialer engine, sessions, callbacks, AI summary, exports, lead auto-capture
├── templates.js         178 lines — WhatsApp templates: 6 langs × 6 categories + CelerApps product templates (DialKaro/BillKaro)
├── favicon.png + CNAME (custom domain: dialkaro.celerapps.com)
├── supabase/            SQL migrations (run in order, see "DB schema" section below)
│   └── functions/webhook-leads/index.ts  — Deno Edge Function for inbound webhooks
├── branding/dialkaro/   Marketing assets, demo video, voiceover, Loom thumbnails
│   └── campaign/        30-day sales playbook, ICP, prospecting scripts, demo flow, pricing, WhatsApp drips
├── clients/ONBOARDING_GUIDE.md   How to add a new tenant (Super Admin Panel preferred over manual SQL)
└── docs/                PRODUCT_DEFAULT.md, lead-capture-setup.md
```

## Architecture flows

### 1. Tenant resolution on page load

`auth.js → loadTenantConfig()` is called from `DOMContentLoaded`:

- **localhost / *.github.io** → load tenant where `slug = 'dialkaro'`
- **Production hostname** → match `tenants.hostname = window.location.hostname`, fall back to `tenants.slug = hostname.split('.')[0]`
- The matched tenant overrides `APP_CONFIG` (app_name, emoji, taglines), `ADMIN_HASH`, `SUPER_HASH`, `MAX_REPS`, then `applyAppConfig()` rewrites the DOM text.

### 2. Four-tier access model

| Role | Entry point | Identity | Sees |
|------|-------------|----------|------|
| **Sales Rep** | "Sales Rep" card → register/login | `auth.users` row + `user_profiles.tenant_id` (set via Team Code at registration) | Own dialer, own callbacks |
| **Tenant Admin** | "Manager" card → `admin` + `admin_hash` for that tenant | No `auth.users` row — pure SHA-256 hash check vs `tenants.admin_hash` | Their tenant: users tab, analytics, leaderboard, leads |
| **Tenant Super Admin** | "Manager" card → `admin` + `super_hash` for that tenant | Hash check vs `tenants.super_hash` | Same as admin + can edit `subscription_end`, `max_reps` |
| **CelerApps Platform Admin** | **Triple-click footer** → password + email OTP 2FA | Hash check vs `CELERAPPS_SUPER_HASH` (hardcoded `auth.js:1796`) + Supabase OTP to `hello@celerapps.com` | All tenants, add/disable tenants, global cross-tenant stats |

The platform-admin email-OTP flow uses Supabase `signInWithOtp({ email })` then immediately signs out the temp session — local access is gated by an in-memory flag plus a 7-day "trust this device" localStorage marker.

### 3. Registration flow (rep)

1. Rep enters Team Code → `tenants.team_code = ?` lookup → tenant locked in, branding swapped.
2. Slot check: `count(user_profiles where tenant_id = X)` < `tenants.max_reps`.
3. `supabase.auth.signUp()` creates the `auth.users` row.
4. `user_profiles` row upserted with `status = 'pending'`, `tenant_id = currentTenant.id`.
5. Rep is signed out — they cannot log in until tenant admin clicks **Approve** (`status → 'active'`).
6. Statuses are: `pending`, `active`, `suspended`, `rejected` — login enforces these.

### 4. Dialer engine (the rep's daily loop)

`dialer.js` flow:

1. **Upload** Excel/CSV → `parseRows()` builds column dropdowns → `startQueue()` normalizes phones (Indian +91 6-9 prefix, or international toggle).
2. **`cleanNumber()`** is the phone normalizer — handles `91XXX`, `0XXX`, raw 10-digit, and intl mode (US/UK/UAE/SG/AU). Don't change without checking both Indian and intl paths.
3. **Dialer card** shows current contact. Rep clicks 📞 (tel link) or 📲 (wa.me link) → marks outcome (interested/callback/noanswer/notinterested) → tags optional call note → next.
4. **Auto-save** to `call_sessions` (debounced via `markDirty()` + `_isDirty` flag). On reopen, `checkForActiveSession()` shows the resume modal.
5. **Callbacks** — choosing "callback" outcome opens `cbModal` to schedule a date/time, saved to `callbacks` table.
6. **DND guard** — banner shown 9 PM – 9 AM IST (TRAI compliance). Non-blocking, just informational.
7. **End of session** → `allDone()` → daily stats upserted to `daily_stats` → AI summary modal generates a WhatsApp-formatted report via Cloudflare Worker (`AI_PROXY_URL = https://royal-pine-470f.aaddyyss90.workers.dev`) or falls back to a deterministic template.
8. **Export** — PDF (jsPDF, lazy-loaded) or Excel (XLSX) of the full call log + summary sheet.

### 5. Webhook lead auto-capture

`supabase/functions/webhook-leads/index.ts` runs as a Deno Edge Function:

- Endpoint: `${SUPABASE_URL}/functions/v1/webhook-leads?tenant=<slug>`
- Auth: per-tenant `webhook_secret` (24-byte hex, generated at tenant create time) — sent as `body.secret` or `X-Webhook-Secret` header.
- Parsers: generic JSON (`name`/`phone`/`email`/`interest`/`specialty`) + Facebook Lead Ads `entry[].changes[].value.field_data` shape.
- **Round-robin assignment** via `getNextRep()`:
  - If `lead.specialty` is set AND ≥1 active rep has matching `user_profiles.specialty` (case-insensitive) → assign among the matched group.
  - Else fall back to all active reps.
  - Picks the rep with the fewest `status = 'new'` leads currently assigned.
- Dedup: `UNIQUE(tenant_id, phone)` — duplicates return 200 `{ status: 'duplicate' }` (not an error).
- Reps see "📥 Load from Leads (N new)" in the dialer header (`checkNewLeads()`); clicking loads them into the same in-memory `contacts[]` the Excel parser fills, with `_leadId` linkage so outcomes sync back to `leads` via `syncLeadOutcome()`.

## Database schema

Run migrations in this order on a fresh Supabase project:

1. `migration_multi_tenant.sql` — creates `tenants`, adds `tenant_id` to `user_profiles`/`call_sessions`/`daily_stats`/`callbacks`, RLS policies, indexes.
2. `add_team_codes.sql` — `tenants.team_code` (unique).
3. `add_subscription_column.sql` — `tenants.subscription_end DATE`.
4. `fix_tenant_rls.sql` — adds INSERT/UPDATE policies on `tenants` (⚠️ **superseded by step 9 — those policies are revoked**).
5. `migration_leads.sql` — creates `leads` table, adds `tenants.webhook_secret`.
6. `migration_leads_fix_fk.sql` — repoints `leads.assigned_to` FK to `user_profiles(id)` so PostgREST embed works.
7. `migration_leads_cost_optimize.sql` — drops the unused `raw_data` JSONB column.
8. `migration_specialty.sql` — adds `user_profiles.specialty` (free-text) and `leads.specialty` for skill-based routing.
9. **`migration_security_week0.sql`** — Week-0 hardening (see [docs/SECURITY_WEEK0.md](../../../docs/SECURITY_WEEK0.md)). Creates `platform_secrets`, `public_tenants` view, and `SECURITY DEFINER` RPCs (`verify_tenant_admin`, `verify_super_admin`, `super_admin_*`, `tenant_admin_*`, `tenant_active_rep_count`). Revokes anon read/write on `tenants` and tightens `user_profiles` UPDATE.

### Tables

| Table | Key columns | RLS |
|-------|-------------|-----|
| `tenants` | `slug`, `hostname`, `app_name`, `app_emoji`, `team_code`, `admin_username`, `admin_hash`, `super_hash`, `max_reps`, `subscription_end`, `is_active`, `webhook_secret` | Public SELECT, public INSERT/UPDATE (Super Admin panel writes; access controlled by hash check at app layer) |
| `user_profiles` | `id` (= `auth.users.id`), `tenant_id`, `full_name`, `email`, `phone_number`, `status`, `subscription_end`, `specialty` | SELECT all, INSERT/UPDATE own (`id = auth.uid()`) |
| `call_sessions` | `user_id`, `tenant_id`, `session_date`, `contacts JSONB`, `current_index`, `called_count`, `skipped_count`, `status` | All ops on own (`user_id = auth.uid()`) |
| `daily_stats` | `user_id`, `tenant_id`, `stat_date`, `called`, `skipped`, `interested`, `callback`, `noanswer`, `notinterested`, `total_leads`, `avg_call_duration` | All on own; SELECT same-tenant rows |
| `callbacks` | `user_id`, `tenant_id`, `contact_name`, `contact_number`, `country_code`, `callback_date`, `callback_time`, `note`, `status` | All on own |
| `leads` | `tenant_id`, `assigned_to`, `phone`, `full_name`, `email`, `source`, `interest`, `specialty`, `status`, `call_note`, `called_at`, `UNIQUE(tenant_id, phone)` | SELECT same-tenant, UPDATE if assigned or same-tenant, INSERT via service role only |

## Subscription enforcement

`checkTenantSubscription(tenant)` in `auth.js` returns `{ blocked, warning, daysLeft, message }`:

| Days remaining | Behavior |
|----------------|----------|
| `null` (no date set) | Unlimited — for demos / internal tenants |
| `> 7` | Normal access |
| `1-7` | Amber `showSubWarningBanner()` for everyone |
| `≤ 0` | `showSubBlockedOverlay()` — all logins (rep, admin, super, registration) blocked |

Per-rep `user_profiles.subscription_end` exists too but is rarely used — tenant-level is the primary lever.

## Common tasks — recipes

### "Onboard a new client"

Prefer **Super Admin Panel** (no SQL): triple-click footer → enter platform password → email OTP → Add Tenant tab → fill form (auto-hashes pw) → Create. See [clients/ONBOARDING_GUIDE.md](../../../clients/ONBOARDING_GUIDE.md).

If forced to use SQL, follow `supabase/add_client_xyz.sql` as the template — generate hashes with `echo -n 'password' | shasum -a 256`.

### "Reset a tenant admin's password"

Super Admin panel → Tenants tab → 🔑 Reset PW button (`resetTenantAdminPassword()` in `auth.js`). Prompts twice for new password, hashes it, updates `tenants.admin_hash`. Share new password with client manually.

### "Add a new WhatsApp template language or category"

Edit [templates.js](../../../templates.js) — `TEMPLATES` is `{ categoryKey: { name, text: { langCode: fn(name, repName) → string } } }`. Add language entries to `TEMPLATE_LANGS` for the language switcher.

For CelerApps-only product templates, edit `CELERAPPS_TEMPLATES` (visible only on `dialkaro` tenant — gated by `_showCelerChip()` in `dialer.js`). Each product has `{ label, emoji, demoVideo, items: { itemKey: { name, text(name, repName, demoVideoUrl) } } }`.

### "Add a new admin panel tab"

1. Add `<div id="adminPanel-foo">` markup in [index.html](../../../index.html).
2. Add `<div id="adminTab-foo" onclick="switchAdminTab('foo')">` button.
3. In `auth.js`, extend the tab list in `switchAdminTab()` and add a `loadFoo()` call there.
4. RLS: ensure your queries filter `.eq('tenant_id', currentTenant.id)`.

### "Wire a new lead source"

For a website form: paste the snippet from `auth.js → showSnippetModal()` (or `docs/lead-capture-setup.md`) — looks for `<form data-dialkaro>` and POSTs to the Edge Function.

For Zapier/Pabbly/custom: POST JSON to the webhook URL with `secret` field. The Edge Function accepts these aliases: `name|full_name|Name|customer_name`, `phone|phone_number|mobile|Phone|contact`, `email|Email|email_address`, `interest|product|message|requirement`, `specialty|category|lead_type`.

### "Debug 'Invalid Team Code'"

```sql
SELECT slug, app_name, team_code, is_active FROM tenants;
```
Team codes must be uppercase, unique, and the tenant `is_active = true`.

### "Header still shows 'DialKaro' after a tenant logs in"

- Hard refresh (the service worker caches aggressively).
- Check console for `[Tenant] Loaded: <name>` log line.
- Verify `tenants.app_name` is set in the DB.
- If a rep — `loadUserTenant()` runs on `enterApp()` and re-applies branding from the rep's `user_profiles.tenant_id`. If broken, check that the rep has a non-null `tenant_id`.

## Hardcoded constants — when to change which

| Constant | Where | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | `auth.js:77` | Anon key on next line — committed by design (RLS protects everything) |
| Platform super-admin hash | `platform_secrets` table (key `celerapps_super_hash`) | Server-side after Week 0. Rotate via `UPDATE platform_secrets SET value = '<sha256>' WHERE key = 'celerapps_super_hash'` |
| `CELERAPPS_SUPER_EMAIL` | `auth.js` | OTP destination for platform admin 2FA |
| `AI_PROXY_URL` | `dialer.js:1072` | Cloudflare Worker proxying Anthropic/Claude calls — keeps API key off the client |
| `EMAILJS_*` | `dialer.js:1191-1193` | Currently placeholders — falls back to `mailto:` if not set |
| `SUPER_TRUST_DAYS` | `auth.js` | How long "trust this device" persists for platform admin |

## Sales / go-to-market context

The product is live; **as of the last update there were no paying clients yet** — the campaign in `branding/dialkaro/campaign/` is the playbook for the first 10. When the user mentions outreach, demos, pricing, ICP, or templates, refer to:

- [SALES_PLAYBOOK.md](../../../branding/dialkaro/campaign/SALES_PLAYBOOK.md) — 30-day day-by-day plan
- [ICP_TARGET_LIST.md](../../../branding/dialkaro/campaign/ICP_TARGET_LIST.md) — 5 segments (DSA loan agents P0, real estate brokers P1, EdTech P2, insurance P3, fintech/NBFC P3)
- [PROSPECTING_SCRIPTS.md](../../../branding/dialkaro/campaign/PROSPECTING_SCRIPTS.md) — IndiaMART/JustDial/LinkedIn search queries
- [DEMO_FLOW.md](../../../branding/dialkaro/campaign/DEMO_FLOW.md) — 15-min live demo structure with timing and objection handling
- [PRICING_PLAYBOOK.md](../../../branding/dialkaro/campaign/PRICING_PLAYBOOK.md) — Starter ₹2,499 / Growth ₹4,999 / Scale ₹9,999 / Enterprise custom; 14-day free trial; early-adopter ₹1,999 lifetime lock
- [WHATSAPP_SEQUENCES.md](../../../branding/dialkaro/campaign/WHATSAPP_SEQUENCES.md) — drip sequences per ICP segment

## Week-0 hardening invariants (don't regress)

After [migration_security_week0.sql](../../../supabase/migration_security_week0.sql) is applied, these patterns must be preserved on every edit:

1. **Never read from `tenants` directly from the browser** — anon/authenticated have no SELECT on it. Use `public_tenants` for safe columns, or call a `SECURITY DEFINER` RPC.
2. **Never write to `tenants` directly from the browser** — use `super_admin_create_tenant` / `super_admin_update_tenant` (super-hash gated).
3. **Never UPDATE `user_profiles` for someone else's row directly** — RLS only allows `id = auth.uid()`. Admin actions go through `tenant_admin_update_rep_status` / `tenant_admin_set_rep_specialty` / `tenant_admin_set_rep_subscription`.
4. **Slot counting filters `status='active'`** — both `userRegister` and `saveMaxReps` use `tenant_active_rep_count(tenant_id)` RPC. Don't switch back to `count(*) where tenant_id = X` (would re-introduce H1: pending registrations DoS the team code).
5. **`_currentAdminHash` / `_currentSuperHash` are the auth tokens** — populated after `verify_tenant_admin` / `verify_super_admin` RPCs succeed. Cleared on logout and 30-min idle. Pass them to every admin RPC so the server can prove the caller is authorized.
6. **`webhook_secret` is no longer in the public_tenants view** — fetch via `tenant_admin_get_webhook_secret(tenant_id, admin_hash)` RPC. The `currentTenant.webhook_secret` JS field is populated lazily by `loadAdminLeads`.
7. **Platform super-admin password lives in `platform_secrets`** — not in JS. Verified via `verify_super_admin(hash)` RPC, rotated via SQL `UPDATE`.

## Things that will bite you

1. **Editing `auth.js` line numbers** — references in code comments (`H-3 FIX`, `M-1 FIX`, `C-3 FIX`, etc.) point to past bugfixes. Don't strip these comments; they document subtle subscription / tenant / RLS edge cases.
2. **`call_sessions.contacts JSONB`** — entire contacts array is serialized on every save. Don't add huge per-contact fields.
3. **Service Worker caching** — `app.js → initPWA()` registers a SW with `cacheVersion = 'sales-dialer-' + Date.now()` so each load busts the cache. Don't switch to a static cache name.
4. **Daily stats accumulate** (`saveDailyStats()` in `dialer.js`) — uses `Math.max()` to prevent double-counting if a rep starts/finishes multiple sessions in one day. Keep this pattern; switching to plain overwrite double-counts.
5. **Phone normalization** — `cleanNumber()` only accepts Indian `[6-9]`-prefix 10-digit numbers by default. International mode is opt-in via the `intlToggle` checkbox; don't relax the default — Indian compliance + cleaner data.
6. **Triple-click footer is the ONLY way to access platform admin** — there is no URL route. If you change the footer markup, update the listener in `auth.js:1837`.
7. **`webhook_secret` is auto-generated** by `encode(gen_random_bytes(24), 'hex')` at tenant insert. If a tenant row was created before that column existed, the backfill in `migration_leads.sql` Section 3 fills it in.
8. **EmailJS keys are placeholders** — the email-report feature falls back to `mailto:` if you don't set `EMAILJS_PUBLIC_KEY`. Don't commit real keys; use the `mailto` fallback for now.

## Brand voice and copy guidelines

- **App name** is "DialKaro" (one word, "K" capital). Tagline: "Dial Faster · Close Smarter".
- **Parent**: "by CelerApps". Footer always includes `🔒 Powered by CelerApps`.
- **Hinglish welcome** in WhatsApp templates, not in product UI strings.
- **Indian-first**: ₹ not $, +91 default, IST timezone, names like Rahul/Priya/Rajesh in placeholders.
- **Emoji density**: high in marketing copy, moderate in product UI, low in code comments.
- **Tone**: confident, warm, never enterprise-stiff. The product positions against Salesforce/Ameyo/Exotel as the "tool reps actually use 8 hours a day."
