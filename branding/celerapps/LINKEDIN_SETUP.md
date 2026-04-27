# CelerApps — LinkedIn Page Setup Pack

All assets and copy for creating linkedin.com/company/celerapps

---

## Files in this folder

All assets generated from your real logo (`source-logo.png`).

### LinkedIn (Phase 1 essentials)
| File | Purpose | LinkedIn upload? |
|------|---------|------------------|
| `linkedin-logo-400.png` | **400×400, navy gradient bg, icon centered** | ✅ Page logo |
| `linkedin-logo-transparent-400.png` | Transparent-bg variant for light surfaces | Optional alt |
| `linkedin-banner-1128x191.png` | **Banner: tagline + DialKaro/BillKaro chips + your icon on right** | ✅ Page banner |

### Social media + extras
| File | Use |
|------|-----|
| `social-square-1080.png` | Instagram / X / Facebook posts (full lockup, navy gradient) |
| `email-signature-200x60.png` | Email footer signature (transparent bg) |
| `favicon-32.png` | Browser tab icon (celerapps.com) |
| `apple-touch-180.png` | iOS home-screen icon (when users save your site to home) |

### Source masters
| File | Use |
|------|-----|
| `source-logo.png` | Original 2048×2048 (untouched) |
| `logo-master-transparent.png` | Trimmed full lockup (icon + CelerApps + tagline) on transparent bg |
| `logo-mark-transparent.png` | Icon-only mark on transparent bg (for compact placements) |

To regenerate everything if you ever update `source-logo.png`, re-run the
Python script at the bottom of this file.

---

## 1. Page Name + URL

| Field | Value |
|-------|-------|
| Page name | **CelerApps** |
| LinkedIn public URL | **linkedin.com/company/celerapps** |
| Website | **https://celerapps.com** |
| Verification email | **hello@celerapps.com** |

---

## 2. Tagline (max 120 chars)

```
AI-powered SaaS for Indian businesses · DialKaro · BillKaro
```
(88 chars)

---

## 3. About / Description (paste into "Overview")

```
CelerApps builds AI-powered SaaS products designed specifically for how
India does business — on WhatsApp, in regional languages, at scale.

🚀 OUR PRODUCTS

▸ DialKaro — AI-powered sales dialer
   Upload any Excel/CSV, auto-dial leads via phone or WhatsApp, get
   Claude AI session summaries, and manage entire sales teams from
   one dashboard. 3× more calls per day vs manual dialing.

▸ BillKaro — WhatsApp-first invoicing
   GST-ready invoices sent over WhatsApp with one-tap UPI payment
   links. Automated reminders, AI-powered collection predictions,
   2.3M+ invoices processed.

🇮🇳 BUILT FOR INDIA

▸ WhatsApp-native — meet customers where they already are
▸ UPI-first payments — no card friction
▸ Multi-language support — 6 Indian languages
▸ GST-compliant out of the box
▸ Priced for Indian SMBs

🤖 POWERED BY AI

Claude AI generates daily session summaries, predicts payment
collection probability, and surfaces insights human managers
would take hours to find.

🛡️ ENTERPRISE-GRADE FOUNDATION

Supabase-powered authentication, row-level security, encrypted at
rest. Trusted by DSA networks, real estate brokers, and SMB sales
teams across 28 states.

────────────────────
Try DialKaro: dialkaro.celerapps.com
Try BillKaro: billkaro.celerapps.com
Web: celerapps.com
Contact: hello@celerapps.com
```

---

## 4. Specialties (paste comma-separated)

```
SaaS, Artificial Intelligence, Sales Automation, WhatsApp Business, Invoicing Software, GST Compliance, UPI Payments, Indian SMB, Lead Management, Sales Dialer, Auto Dialer, AI Productivity, B2B SaaS, FinTech, SalesTech, Made in India
```

---

## 5. Other settings

| Field | Value |
|-------|-------|
| Industry | **Software Development** |
| Company size | **2-10 employees** |
| Company type | **Privately held** |
| Year founded | **2024** (or actual) |
| Headquarters | (your real city) |
| Phone | (skip — use email) |

---

## 6. Stealth-founder rules (so you don't surface as CEO)

- ❌ Do **not** add yourself as a "Founder" or "CEO" on your **personal** LinkedIn profile yet
- ✅ Make yourself a **Super Admin** of the page — admin status is private (only other admins see it)
- ❌ Do **not** auto-share company posts to your personal feed
- ✅ Post **as the page** (CelerApps) — never as yourself
- ✅ All inbound replies / DMs go to `hello@celerapps.com`
- 🔄 Plan a "founder reveal" post for later, once your day-job situation allows

---

## 7. Day-1 actions (after page goes live)

1. **Create Showcase Pages** for each product (separate followers + analytics):
   - linkedin.com/showcase/dialkaro
   - linkedin.com/showcase/billkaro
2. Add LinkedIn icon → footer of celerapps.com
3. Schedule **Post 1 (welcome)** — copy below
4. Personally follow the page from your own LinkedIn (anonymous-mode if you want)
5. Ask 5-10 friends to follow on Day 1 — algo boost

---

## 8. First-week post (Day 1) — paste-ready

```
🚀 CelerApps is now on LinkedIn.

We're building AI-powered SaaS for the way India *actually* does business —
on WhatsApp, in regional languages, on UPI rails.

Two products live today:

▸ DialKaro — AI-powered sales dialer
  3× more calls per day · Claude AI session summaries
  
▸ BillKaro — WhatsApp-first invoicing
  GST invoices on WhatsApp · One-tap UPI collection

Built by a small team obsessed with Indian SMB workflows.

Follow for product updates, behind-the-scenes builds, and stories from
the founders, freelancers, and field-sales teams using CelerApps.

🌐 celerapps.com

#MadeInIndia #SaaS #IndianStartups #DialKaro #BillKaro #SalesTech #WhatsAppBusiness
```

---

## 9. Asset checklist

| Asset | File | Status |
|-------|------|--------|
| Logo PNG (400×400) | `linkedin-logo-400.png` | ✅ Ready |
| Banner PNG (1128×191) | `linkedin-banner-1128x191.png` | ✅ Ready |
| Tagline | section 2 above | ✅ Ready |
| Description | section 3 above | ✅ Ready |
| Specialties | section 4 above | ✅ Ready |
| Verification email | hello@celerapps.com | ✅ Already yours |
| Day-1 post copy | section 8 above | ✅ Ready |
| Showcase pages | Create after main page | ⬜ Day 1 task |

---

## Re-generating PNGs (if you ever update `source-logo.png`)

All assets are derived from `source-logo.png` via Python + Pillow.
If you swap that file, re-run the build script:

```bash
cd "branding/celerapps"

# One-time venv (Pillow can't pip-install into system Python on macOS)
python3 -m venv /tmp/celervenv
/tmp/celervenv/bin/pip install --quiet Pillow

# Re-render every asset from source-logo.png
/tmp/celervenv/bin/python build_assets.py
```

The script:
1. Strips white background from `source-logo.png` (threshold 220)
2. Computes bbox → produces `logo-master-transparent.png` (full lockup) and
   `logo-mark-transparent.png` (icon only)
3. Renders the LinkedIn logo (400×400, navy gradient), transparent variant,
   banner (1128×191), social square (1080×1080), email signature (200×60),
   favicon (32×32), and Apple touch icon (180×180)
