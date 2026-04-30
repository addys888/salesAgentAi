# Day 1 — Loom Recording Checklist (20 min total)

Everything you need is ready. Follow this sequence.

---

## Pre-flight (5 min)

**1. Generate the password hash** (one terminal command):
```bash
echo -n "demo1234" | shasum -a 256
```
Copy the 64-char hex output.

**2. Open** [`demo_tenant_seed.sql`](demo_tenant_seed.sql) **and replace `ADMIN_HASH_HERE`** with that hex.

**3. Run the SQL** in Supabase Dashboard → SQL Editor → New Query.

**4. Login to your dialer:**
| Field | Value |
|-------|-------|
| Team code | `DEMO2026` |
| Admin username | `demoadmin` |
| Admin password | `demo1234` |

**5. Through the admin UI, create 4 demo reps with these specialties:**
| Name | Specialty |
|------|-----------|
| Rohit Sharma | home-loan |
| Priya Iyer | health-insurance |
| Aakash Verma | personal-loan |
| Sneha Kulkarni | life-insurance |

**6. Open Chrome Incognito at 1920×1080** for the actual recording.

> 💡 No "super admin" credentials needed — that role is platform-level
> only (one global CelerApps Super Admin), not per-tenant.

---

## Recording (10 min — including 4 takes)

- [ ] Open [`LOOM_DEMO_SCRIPT.md`](LOOM_DEMO_SCRIPT.md) on your phone or second monitor
- [ ] Have [`demo-sample-leads.csv`](demo-sample-leads.csv) ready in Downloads
- [ ] DND on, headphones in, mic test
- [ ] Loom → New Recording → Screen + Camera (camera optional)
- [ ] Record 3-4 takes. The 4th is always your best.
- [ ] Trim dead air

---

## Publishing (5 min)

### Loom settings
| Field | Paste this |
|-------|------------|
| Title | `DialKaro — 60-second demo (AI sales dialer for India)` |
| Custom thumbnail | Upload [`loom-thumbnail-1280x720.png`](loom-thumbnail-1280x720.png) |
| Description | (paste from below) |
| Privacy | Public — anyone with link |

### Loom description (paste-ready)

```
DialKaro is an AI-powered sales dialer built for Indian SMBs.

In 60 seconds:
✅ Excel/CSV upload → auto-dial
✅ Phone + WhatsApp from one click
✅ Specialty-based lead routing
✅ Claude AI session summaries

3× more calls per day vs manual dialing.

Try it: https://dialkaro.celerapps.com
Contact: hello@celerapps.com

#SaaS #SalesTech #IndianStartups #MadeInIndia
```

### Where to use the Loom URL after upload

- [ ] LinkedIn DialKaro showcase page → "About" section
- [ ] Day-1 LinkedIn post (paste in `[Loom link]` placeholder)
- [ ] dialkaro.celerapps.com hero section
- [ ] Email signature: "60-sec demo: {Loom URL}"
- [ ] Cold WhatsApp templates in [`COLD_OUTREACH_TEMPLATES.md`](COLD_OUTREACH_TEMPLATES.md)
- [ ] Loom title also gets pinned to the LinkedIn page banner

---

## Files in this folder

| File | What it does |
|------|--------------|
| `LOOM_DEMO_SCRIPT.md` | Word-for-word script with timestamps |
| `loom-thumbnail-1280x720.png` | Custom Loom/YouTube thumbnail |
| `demo-sample-leads.csv` | 50 realistic Indian leads with mixed phone formats + specialties |
| `demo_tenant_seed.sql` | Creates the `demo` tenant in Supabase |
| `build_thumbnail.py` | Regenerator for the thumbnail (Pillow) |
| `LINKEDIN_SHOWCASE_SETUP.md` | Day 2 — LinkedIn showcase setup |
| `LINKEDIN_POSTS_WEEK1.md` | Day 2/4/7 — paste-ready posts |
| `COLD_OUTREACH_TEMPLATES.md` | Day 5 — outreach (use legal channels) |
| `BLOG_POST_1.md` | Day 3 — SEO blog post |

---

## Troubleshooting

**Loom upload stuck?** Use Loom Desktop app (not browser) for >2 min recordings.

**Leads CSV fails to import?** The dialer expects specific column headers.
Check `dialer.js` parser — it should accept `name, phone, email, interest, specialty`.

**Claude AI summary not generating?** Confirm your Anthropic API key is set
in the tenant's environment. Without it, the summary feature is dark.

**Specialty routing not visible in demo?** Make sure each rep's `specialty`
field is set BEFORE uploading the CSV. The webhook only matches at upload time.
