# 🚀 DialKaro — Client Onboarding Guide

> **Version**: 2.0 · **Last Updated**: April 2026 · **By CelerApps**
>
> Two paths to onboard: **Super Admin Panel** (recommended) or **Manual SQL**.
> Super Admin Panel requires no SQL and takes ~2 minutes.

---

## 🏆 Option A: Super Admin Panel (Recommended)

### Step 1: Access the Panel
1. Open [dialkaro.celerapps.com](https://dialkaro.celerapps.com)
2. **Triple-click** the footer text ("🔒 Powered by CelerApps...")
3. Enter the CelerApps platform password
4. You're in the CelerApps Console

### Step 2: Add the Tenant
1. Click the **➕ Add Tenant** tab
2. Fill in the form:

| Field | What to Enter | Example |
|-------|--------------|---------|
| 🏢 Company Name | Client's company | Skyline Realty |
| 📝 Subtitle | Tagline under header | Build · Sell · Grow |
| 😀 Emoji | Header icon | 🏠 |
| 🎨 Color | Brand hex color | #E67E22 |
| 💬 Tagline | Landing page text | Smart calling for real estate |
| 🏷 Team Code | Unique, UPPERCASE | SKYLINE2026 |
| 👥 Max Reps | Rep limit | 15 |
| 🔑 Admin Password | For client's manager | skyline@admin2026 |
| 🔐 Super Admin Pass | For you (CelerApps) | skyline@super2026 |
| 📅 Subscription End | Optional expiry date | 2027-04-21 |

3. Click **🚀 Create Tenant**
4. Done! Passwords are auto-hashed with SHA-256.

### Step 3: Manage After Creation
Switch to the **🏢 Tenants** tab to:
- ✏️ Edit **Team Code** — click the field, change, auto-saves
- ✏️ Edit **Max Reps** — click the number, change, auto-saves
- 📅 Set **Subscription** — pick a date, auto-saves
- 🔴 **Disable/Enable** — click the button, confirms with dialog

### Step 4: Verify
- [ ] Admin login works with the password you set
- [ ] Rep registration works with the team code
- [ ] Header shows client's company name

### Step 5: Share with Client
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Welcome to DialKaro! 🎉
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your sales dialer is ready:

🌐 URL:           https://dialkaro.celerapps.com
👤 Manager Login:  admin
🔑 Password:      [ADMIN_PASSWORD]

📋 Team Code for reps: [TEAMCODE]
   (Share with reps so they can register)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Powered by CelerApps
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 📋 Option B: Manual SQL (Advanced)

Use this if you can't access the Super Admin Panel.

### Step 1: Gather Client Info

| # | Field | Example |
|---|-------|---------|
| 1 | Company Name | Skyline Realty |
| 2 | Subtitle | Build · Sell · Grow |
| 3 | Emoji | 🏠 |
| 4 | Brand Color | `#E67E22` |
| 5 | Tagline | Smart calling for real estate teams |
| 6 | Team Code | `SKYLINE2026` |
| 7 | Max Reps | 15 |
| 8 | Admin Password | `skyline@admin2026` |
| 9 | Super Admin Pass | `skyline@super2026` |
| 10 | Subscription End | `2027-04-21` (optional) |

### Step 2: Generate Hashes

```bash
echo -n 'skyline@admin2026' | shasum -a 256 | awk '{print $1}'
echo -n 'skyline@super2026' | shasum -a 256 | awk '{print $1}'
```

> ⚠️ Use `echo -n` (no newline) — without `-n` the hash will be wrong.

### Step 3: Run SQL

```sql
INSERT INTO tenants (
  slug, hostname, app_name, app_subtitle, app_emoji,
  landing_title, landing_tagline, primary_color, team_code,
  admin_hash, super_hash, max_reps, subscription_end, is_active
) VALUES (
  'skylinerealty',
  'dialkaro.celerapps.com',
  'Skyline Realty',
  'Build · Sell · Grow',
  '🏠',
  'Skyline Realty',
  'Smart calling for real estate teams',
  '#E67E22',
  'SKYLINE2026',
  'PASTE_ADMIN_HASH',
  'PASTE_SUPER_HASH',
  15,
  '2027-04-21',
  true
);
```

### Step 4: Create Config File

```bash
mkdir -p clients/skyline-realty
```

Create `clients/skyline-realty/config.md` with credentials and branding.

### Step 5: Test & Share
Same as Option A, Steps 4 & 5.

---

## 📅 Subscription Management

### How It Works

| Days Remaining | What Happens |
|---------------|--------------|
| > 7 days | ✅ Normal access for all users |
| ≤ 7 days | ⚠️ Amber banner: "Your subscription expires in X days" |
| Expired (0 or less) | 🔒 **ALL logins blocked** — reps, admins, registrations |
| No date set | ✅ Unlimited access (for demos and internal use) |

### Setting/Changing Subscription

**Via Super Admin Panel:**
1. Go to 🏢 Tenants tab
2. Find the tenant
3. Pick a date in the Subscription column
4. Auto-saves immediately

**Via SQL:**
```sql
UPDATE tenants SET subscription_end = '2027-12-31' WHERE slug = 'skylinerealty';
```

**To remove limit (unlimited access):**
```sql
UPDATE tenants SET subscription_end = NULL WHERE slug = 'skylinerealty';
```

---

## 🔧 Troubleshooting

### "Invalid Team Code" during registration
```sql
SELECT team_code FROM tenants;
-- If NULL: UPDATE tenants SET team_code = 'CODE' WHERE slug = 'slugname';
```

### Header still shows "DialKaro" after login
- Hard refresh: `Ctrl+Shift+R` / `Cmd+Shift+R`
- Check console for `[Tenant] Loaded:` log
- Verify: `SELECT app_name FROM tenants WHERE slug = 'slugname';`

### Edits not saving in Super Admin
Run this SQL to fix RLS:
```sql
DROP POLICY IF EXISTS "Allow tenant inserts" ON tenants;
CREATE POLICY "Allow tenant inserts" ON tenants FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow tenant updates" ON tenants;
CREATE POLICY "Allow tenant updates" ON tenants FOR UPDATE USING (true);
```

### Subscription not blocking users
- Verify column exists: `SELECT subscription_end FROM tenants;`
- If missing: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end DATE;`

### Rep limit reached
```sql
UPDATE tenants SET max_reps = 25 WHERE slug = 'slugname';
```

---

## 📊 Quick Reference SQL

```sql
-- All tenants
SELECT slug, app_name, team_code, max_reps, subscription_end, is_active
FROM tenants ORDER BY created_at;

-- Rep count per tenant
SELECT t.app_name, COUNT(u.id) AS reps, t.max_reps
FROM tenants t
LEFT JOIN user_profiles u ON u.tenant_id = t.id
GROUP BY t.id, t.app_name, t.max_reps;

-- Tenants expiring within 7 days
SELECT app_name, subscription_end,
  (subscription_end - CURRENT_DATE) AS days_left
FROM tenants
WHERE subscription_end IS NOT NULL
  AND subscription_end <= CURRENT_DATE + 7;
```

---

## ⏱ Time Summary

| Method | Time |
|--------|------|
| **Super Admin Panel** | ~2 min |
| **Manual SQL** | ~10 min |

---

> **🔒 Security**: Passwords are SHA-256 hashed. Never store plaintext in config files unless the repo is private.
