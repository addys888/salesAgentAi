# 🚀 DialKaro — Client Onboarding Guide

> **Version**: 1.0 · **Last Updated**: April 2026 · **By CelerApps**
>
> This guide walks you through onboarding a new client on DialKaro from scratch.
> **Estimated time**: 10 minutes per client.

---

## 📋 Pre-Requisites

Before you begin, ensure you have:

- [ ] Access to **Supabase Dashboard** → SQL Editor
- [ ] Access to the **salesAgentAi** GitHub repo
- [ ] A terminal with `shasum` (macOS/Linux)
- [ ] The client's company name, desired branding, and preferred passwords

---

## Step 1: Gather Client Information

Collect the following from the client (or decide for them):

| # | Field | Example | Notes |
|---|-------|---------|-------|
| 1 | **Company Name** | Skyline Realty | Used in header |
| 2 | **Subtitle** | Build · Sell · Grow | Shown below company name |
| 3 | **Emoji/Icon** | 🏠 | Header icon |
| 4 | **Tagline** | Smart calling for real estate teams | Landing page |
| 5 | **Brand Color** | `#E67E22` | Primary accent *(optional)* |
| 6 | **Team Code** | `SKYLINE2026` | Unique, UPPERCASE, memorable |
| 7 | **Max Reps** | 15 | How many sales reps allowed |
| 8 | **Admin Password** | `skyline@admin2026` | For the client's manager |
| 9 | **Super Admin Pass** | `skyline@super2026` | For you (CelerApps) only |

> **💡 Naming Conventions**
> - **Slug**: Lowercase, no spaces → `skylinerealty`
> - **Team Code**: UPPERCASE, memorable → `SKYLINE2026`
> - **Passwords**: Minimum 10 chars, include special chars

---

## Step 2: Generate Password Hashes

Run these commands in your terminal:

```bash
# Admin password hash
echo -n 'skyline@admin2026' | shasum -a 256 | awk '{print $1}'
# Output: a1b2c3d4e5f6... (copy this)

# Super admin password hash
echo -n 'skyline@super2026' | shasum -a 256 | awk '{print $1}'
# Output: f6e5d4c3b2a1... (copy this)
```

> ⚠️ **Important**: Use `echo -n` (no newline) — without `-n` the hash will be wrong.

---

## Step 3: Run SQL in Supabase

Open **Supabase Dashboard → SQL Editor → New Query** and run:

```sql
INSERT INTO tenants (
  slug,
  hostname,
  app_name,
  app_subtitle,
  app_emoji,
  landing_title,
  landing_tagline,
  primary_color,
  team_code,
  admin_hash,
  super_hash,
  max_reps,
  is_active
) VALUES (
  'skylinerealty',                    -- unique slug
  'dialkaro.celerapps.com',          -- shared hostname (always this)
  'Skyline Realty',                   -- header name
  'Build · Sell · Grow',             -- header subtitle
  '🏠',                              -- header emoji
  'Skyline Realty',                   -- landing page title
  'Smart calling for real estate teams', -- landing tagline
  '#E67E22',                         -- brand color
  'SKYLINE2026',                     -- team code for reps
  'PASTE_ADMIN_HASH_HERE',          -- from Step 2
  'PASTE_SUPER_HASH_HERE',          -- from Step 2
  15,                                -- max reps
  true
);
```

**Verify:**
```sql
SELECT slug, app_name, team_code, max_reps FROM tenants ORDER BY created_at DESC;
```

---

## Step 4: Create Client Folder

In the repo, create a config file for the client:

```bash
mkdir -p clients/skyline-realty
```

Create `clients/skyline-realty/config.md`:

```markdown
# Skyline Realty — Client Tenant

## Onboarded: 2026-04-20

| Field | Value |
|-------|-------|
| Slug | skylinerealty |
| App Name | Skyline Realty |
| Subtitle | Build · Sell · Grow |
| Emoji | 🏠 |
| Team Code | SKYLINE2026 |
| Max Reps | 15 |
| Admin Password | skyline@admin2026 |
| Super Admin | skyline@super2026 |

## Status
- [x] Tenant created in Supabase
- [ ] Manager trained
- [ ] Reps onboarded
```

Commit and push:
```bash
git add -A
git commit -m "client: onboard Skyline Realty"
git push origin main
```

---

## Step 5: Test the Client Setup

### 5a. Manager Login
1. Go to **https://dialkaro.celerapps.com**
2. Click **"Manager"**
3. Login: `admin` / `skyline@admin2026`
4. ✅ **Verify**: Header shows **🏠 Skyline Realty — Build · Sell · Grow**

### 5b. Rep Registration
1. Open an **incognito window**
2. Go to **https://dialkaro.celerapps.com**
3. Click **"Sales Rep"** → **Register** tab
4. Fill details + Team Code: `SKYLINE2026`
5. ✅ **Verify**: Header switches to **🏠 Skyline Realty** after registration

### 5c. Data Isolation
1. Login as Skyline admin → check Users tab → only Skyline reps visible
2. Login as DialKaro admin → check Users tab → Skyline reps NOT visible
3. ✅ **Verify**: Complete data isolation between tenants

---

## Step 6: Share Credentials with Client

Send this to the client's manager (via secure channel):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Welcome to DialKaro! 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your sales dialer is ready:

🌐 URL:           https://dialkaro.celerapps.com
👤 Manager Login:  admin
🔑 Password:      skyline@admin2026

📋 Team Code for your sales reps: SKYLINE2026
   (Share this with reps so they can register)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW YOUR REPS REGISTER:
1. Open https://dialkaro.celerapps.com
2. Click "Sales Rep" → "Register"
3. Fill in name, email, phone, password
4. Enter Team Code: SKYLINE2026
5. Done! They can start uploading leads.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Powered by CelerApps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔧 Troubleshooting

### "Invalid Team Code" during registration
- Check if the `team_code` column exists: `SELECT team_code FROM tenants;`
- If NULL, run: `UPDATE tenants SET team_code = 'CODE' WHERE slug = 'slugname';`

### Header still shows "DialKaro" after login
- Hard refresh: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Check browser console for `[Tenant] Loaded:` log
- Verify tenant exists: `SELECT * FROM tenants WHERE slug = 'slugname';`

### Admin login shows wrong tenant's data
- Each admin password hash must be **unique** across all tenants
- Run: `SELECT slug, admin_hash FROM tenants;` — check for duplicates

### Rep limit reached
- Error: "Registration is closed. Maximum reps reached"
- Increase limit: `UPDATE tenants SET max_reps = 25 WHERE slug = 'slugname';`

---

## 📊 Quick Reference — All Tenants

To see all active tenants:
```sql
SELECT slug, app_name, team_code, max_reps, is_active,
  created_at::date AS onboarded
FROM tenants
ORDER BY created_at;
```

To count reps per tenant:
```sql
SELECT t.app_name, COUNT(u.id) AS reps, t.max_reps
FROM tenants t
LEFT JOIN user_profiles u ON u.tenant_id = t.id
GROUP BY t.id, t.app_name, t.max_reps
ORDER BY t.app_name;
```

---

## ⏱ Time Summary

| Step | Time |
|------|------|
| Gather info | 2 min |
| Generate hashes | 1 min |
| Run SQL | 1 min |
| Create client folder | 1 min |
| Test | 3 min |
| Share credentials | 2 min |
| **Total** | **~10 min** |

---

> **🔒 Security Note**: Never commit plaintext passwords to the repo. The `config.md` files should only be accessible to CelerApps team members. Consider making the repo private if it isn't already.
