# DialKaro — Sales Dialer by CelerApps

☎️ India's smartest sales dialer for outbound teams. Multi-tenant SaaS hosted on GitHub Pages + Supabase.

**Live**: [dialkaro.celerapps.com](https://dialkaro.celerapps.com)

## Project Structure

```
salesAgentAi/
│
├── index.html              # App entry point (GitHub Pages)
├── styles.css              # Styles (dark theme, responsive)
├── auth.js                 # Auth, multi-tenant, admin console
├── dialer.js               # Dialer engine, sessions, exports
├── app.js                  # Utilities and helpers
├── templates.js            # WhatsApp message templates
├── favicon.png             # App favicon
├── CNAME                   # GitHub Pages custom domain
│
├── supabase/               # 📦 Database scripts
│   ├── migration_multi_tenant.sql
│   ├── add_team_codes.sql
│   └── add_client_xyz.sql
│
├── clients/                # 🏢 Client configs (one folder per client)
│   ├── _template/
│   │   └── onboarding.md   #   ↳ Copy this for new clients
│   ├── xyz-consulting/
│   │   └── config.md       #   ↳ Credentials & branding
│   └── ONBOARDING_GUIDE.md #   ↳ Full step-by-step process
│
└── docs/                   # 📄 Product documentation
    └── PRODUCT_DEFAULT.md  #   ↳ Default tenant config (not a client)
```

## How Multi-Tenancy Works

```
Visitor opens dialkaro.celerapps.com
         ↓
    Landing page shows "DialKaro" (product branding)
         ↓
    ┌─────────────────────────────────────┐
    │  Sales Rep clicks Register          │
    │  Enters Team Code: "XYZ2026"        │
    │  → System finds XYZ tenant          │
    │  → Branding switches to XYZ         │
    │  → Rep tagged with XYZ tenant_id    │
    └─────────────────────────────────────┘
    ┌─────────────────────────────────────┐
    │  Manager logs in with XYZ password  │
    │  → System matches admin_hash        │
    │  → Branding switches to XYZ         │
    │  → Only sees XYZ data               │
    └─────────────────────────────────────┘
```

## Tech Stack
- **Frontend**: Vanilla HTML/JS/CSS (no framework, no build step)
- **Backend**: Supabase (Auth + PostgreSQL + RLS)
- **Hosting**: GitHub Pages + custom domain via CNAME
- **Multi-Tenant**: Single codebase, single DB, tenant isolation via RLS + tenant_id

## Onboarding a New Client (~10 min)
1. Gather client info (name, branding, passwords)
2. Generate SHA-256 hashes for passwords
3. Run 1 SQL INSERT in Supabase
4. Create `clients/new-client/config.md`
5. Share URL + Team Code with client

📖 **Full guide**: [clients/ONBOARDING_GUIDE.md](clients/ONBOARDING_GUIDE.md)
