# New Client Onboarding Template

## 1. Client Details
| Field | Value |
|-------|-------|
| **Company Name** | |
| **Contact Person** | |
| **Email** | |
| **Phone** | |

## 2. Branding
| Field | Value | Example |
|-------|-------|---------|
| **App Name** | | `ABC Realty` |
| **Subtitle** | | `Connect · Convert · Close` |
| **Emoji** | | `🏢` |
| **Landing Title** | | `ABC Realty` |
| **Landing Tagline** | | `Empowering your sales force` |
| **Primary Color** | | `#4A90D9` |

## 3. Generate Credentials
```bash
# Generate admin password hash
echo -n 'YOUR_ADMIN_PASSWORD' | shasum -a 256 | awk '{print $1}'

# Generate super admin password hash
echo -n 'YOUR_SUPER_PASSWORD' | shasum -a 256 | awk '{print $1}'
```

## 4. SQL — Run in Supabase SQL Editor
```sql
INSERT INTO tenants (slug, hostname, app_name, app_subtitle, app_emoji,
  landing_title, landing_tagline, primary_color, team_code,
  admin_hash, super_hash, max_reps, is_active)
VALUES (
  'SLUG_HERE',                -- unique slug (lowercase, no spaces)
  'dialkaro.celerapps.com',   -- shared hostname
  'APP_NAME_HERE',            -- company name
  'SUBTITLE_HERE',            -- subtitle
  'EMOJI_HERE',               -- emoji icon
  'LANDING_TITLE',            -- landing page title
  'LANDING_TAGLINE',          -- landing tagline
  '#COLOR_HEX',               -- brand color
  'TEAMCODE_HERE',            -- unique team code for reps
  'ADMIN_HASH_HERE',          -- from step 3
  'SUPER_HASH_HERE',          -- from step 3
  15,                         -- max reps allowed
  true
);
```

## 5. Share with Client
```
URL:              https://dialkaro.celerapps.com
Manager Login:    admin / [ADMIN_PASSWORD]
Team Code:        [TEAMCODE] (for sales reps to register)
```

## 6. Verify
- [ ] Admin login works and shows correct branding
- [ ] Rep registration with team code works
- [ ] Reps appear in manager's user list
- [ ] Data isolation verified (other tenants can't see this client's data)
