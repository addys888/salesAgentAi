# DialKaro — Sales Dialer by CelerApps

☎️ India's smartest sales dialer for outbound teams. Multi-tenant SaaS hosted on GitHub Pages + Supabase.

**Live**: [dialkaro.celerapps.com](https://dialkaro.celerapps.com)

## Project Structure

```
salesAgentAi/
│
├── index.html              # App entry point (GitHub Pages)
├── styles.css              # Styles (dark theme, responsive)
├── auth.js                 # Auth, multi-tenant, admin, super admin
├── dialer.js               # Dialer engine, sessions, exports
├── app.js                  # Utilities and helpers
├── templates.js            # WhatsApp message templates
├── favicon.png             # App favicon
├── CNAME                   # GitHub Pages custom domain
│
├── supabase/               # 📦 Database scripts
│   ├── migration_multi_tenant.sql  # Initial schema + RLS
│   ├── add_team_codes.sql          # Team code column
│   ├── add_client_xyz.sql          # XYZ Consulting tenant
│   ├── add_subscription_column.sql # Subscription end date
│   └── fix_tenant_rls.sql          # INSERT/UPDATE RLS policies
│
├── clients/                # 🏢 Client onboarding
│   ├── _template/
│   │   └── onboarding.md   #   ↳ Copy for new clients
│   ├── xyz-consulting/
│   │   └── config.md       #   ↳ Credentials & branding
│   └── ONBOARDING_GUIDE.md #   ↳ Full step-by-step guide
│
└── docs/                   # 📄 Product documentation
    └── PRODUCT_DEFAULT.md  #   ↳ Default tenant config
```

## How Multi-Tenancy Works

```
Visitor opens dialkaro.celerapps.com
         ↓
    Landing page shows "DialKaro" (product branding)
         ↓
    ┌─────────────────────────────────────┐
    │  Sales Rep → Register              │
    │  Enters Team Code: "XYZ2026"       │
    │  → System finds XYZ tenant         │
    │  → Branding switches to XYZ        │
    │  → Rep tagged with XYZ tenant_id   │
    └─────────────────────────────────────┘
    ┌─────────────────────────────────────┐
    │  Manager → Login with XYZ password │
    │  → System matches admin_hash       │
    │  → Branding switches to XYZ        │
    │  → Only sees XYZ data              │
    └─────────────────────────────────────┘
```

## Access Levels

| Role | Entry | What They See |
|------|-------|---------------|
| **Sales Rep** | Sales Rep → Login/Register | Dialer, personal stats |
| **Tenant Admin** | Manager → Login (admin pass) | Users, analytics, leaderboard |
| **Tenant Super Admin** | Manager → Login (super pass) | Same + subscription mgmt |
| **CelerApps Admin** | Triple-click footer → Platform pass | All tenants, add clients, global stats |

## CelerApps Super Admin Panel

Hidden platform admin accessible only to CelerApps team:

1. Go to `dialkaro.celerapps.com`
2. **Triple-click** the footer text ("🔒 Powered by CelerApps...")
3. Enter platform password
4. Access: Tenant management, Add Client (no SQL!), Global Stats

### Features
- 🏢 **Tenants Tab** — View all tenants, inline-edit Team Code / Max Reps / Subscription
- ➕ **Add Tenant** — Onboard new client via form (auto-hashes passwords)
- 📊 **Global Stats** — Cross-tenant comparison (calls, interested, callbacks)
- 🔒 **Subscription** — Set expiry dates, auto-block expired tenants

## Subscription Enforcement

| Days Remaining | What Happens |
|---------------|--------------|
| > 7 days | ✅ Normal access |
| ≤ 7 days | ⚠️ Amber warning banner for all reps & admins |
| Expired | 🔒 All logins blocked (reps, admins, registration) |
| No date set | ✅ Unlimited access (demo/internal) |

## Tech Stack
- **Frontend**: Vanilla HTML/JS/CSS (no framework, no build step)
- **Backend**: Supabase (Auth + PostgreSQL + RLS)
- **Hosting**: GitHub Pages + custom domain via CNAME
- **Multi-Tenant**: Single codebase, single DB, tenant isolation via RLS + tenant_id
- **Security**: SHA-256 hashed passwords, RLS policies, hidden admin entry

## Onboarding a New Client

### Option A: Super Admin Panel (Recommended, ~2 min)
1. Triple-click footer → Login as CelerApps admin
2. Go to **➕ Add Tenant** tab
3. Fill form → Click "Create Tenant" → Done!

### Option B: Manual SQL (~10 min)
See `clients/ONBOARDING_GUIDE.md` for full steps.

## SQL Scripts (run in order for fresh setup)
```bash
1. supabase/migration_multi_tenant.sql  # Core schema
2. supabase/add_team_codes.sql          # Team codes
3. supabase/add_subscription_column.sql # Subscription dates
4. supabase/fix_tenant_rls.sql          # RLS write policies
```
