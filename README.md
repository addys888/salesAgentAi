# DialKaro — Sales Dialer by CelerApps

☎️ India's smartest sales dialer for outbound teams. Multi-tenant SaaS hosted on GitHub Pages + Supabase.

**Live**: [dialkaro.celerapps.com](https://dialkaro.celerapps.com)

## Project Structure

```
salesAgentAi/
├── index.html          # Main app entry point
├── styles.css          # All styles (dark theme, responsive)
├── auth.js             # Authentication, multi-tenant, admin console
├── dialer.js           # Dialer engine, sessions, exports, callbacks
├── app.js              # App utilities and helpers
├── templates.js        # WhatsApp message templates
├── favicon.png         # App favicon
├── CNAME               # GitHub Pages custom domain config
│
├── supabase/           # Database scripts
│   ├── migration_multi_tenant.sql   # Initial schema + RLS
│   ├── add_team_codes.sql           # Team code column setup
│   └── add_client_xyz.sql           # XYZ Consulting tenant
│
└── clients/            # Client configs & onboarding docs
    ├── _template/
    │   └── onboarding.md            # Copy this for new clients
    ├── dialkaro/
    │   └── config.md                # Default demo tenant
    └── xyz-consulting/
        └── config.md                # XYZ Consulting config
```

## Tech Stack
- **Frontend**: Vanilla HTML/JS/CSS (no framework)
- **Backend**: Supabase (Auth + PostgreSQL + RLS)
- **Hosting**: GitHub Pages with custom domain
- **Multi-Tenant**: Single codebase, single database, tenant isolation via RLS

## Onboarding a New Client
1. Copy `clients/_template/` → `clients/new-client/`
2. Fill in the branding and generate password hashes
3. Run the SQL INSERT in Supabase
4. Share URL + Team Code with the client

See `clients/_template/onboarding.md` for the full checklist.
