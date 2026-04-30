# DialKaro — First 3 LinkedIn Build-in-Public Posts

These are the first 3 posts to publish on the DialKaro LinkedIn showcase page.
**Cadence:** Day 1, Day 4, Day 7. Then continue 2-3 posts/week.

**Post AS the DialKaro page**, not as yourself. (LinkedIn → "Posting as: DialKaro")

---

## Post 1 — Day 1 (the launch / problem statement)

```
Most "auto-dialers" in the Indian market are American software
with a rupee price tag.

They assume your reps work in English. They assume your leads
have email. They assume payment happens on a credit card.

We built DialKaro for the way India actually sells:

▸ Phone OR WhatsApp from one click — most Indian leads reply faster on WhatsApp than on a call
▸ +91 normalization that doesn't break on 0-prefixed numbers
▸ Specialty-based routing — health-insurance leads go to health-insurance reps automatically
▸ Claude AI writes daily session summaries (no more EOD spreadsheets)
▸ Webhook-native — Meta Lead Ads, IndiaMART, your website all flow in within 60 seconds

3× more calls per day vs manual dialing.
<2 min from lead capture → first dial.

Live today at dialkaro.celerapps.com
60-second demo: [Loom link]

Built for DSA networks, real estate brokers, edtech sales teams,
and any SMB drowning in unrouted leads.

🇮🇳 Made in India. Priced for Indian SMBs. No enterprise lock-in.

#SalesTech #IndianStartups #SaaS #MadeInIndia #AutoDialer #DialKaro
```

**Engagement plan for this post:**
- Personally (from your real LinkedIn) like + comment "this is solving a real gap"
- Ask 5 friends to like + comment within first 2 hours (algo boost)
- Reply to every comment within 30 minutes for 24 hours

---

## Post 2 — Day 4 (build-in-public, technical credibility)

```
Shipped this week: specialty-based lead routing.

Old behavior: lead comes in → assigned to whoever has the fewest
open leads. Random.

New behavior: lead comes in with a "specialty" tag → routed only
to reps who match that specialty. Health-insurance leads to
health-insurance reps. Real-estate to real-estate. Auto.

Why we built it: a customer's reps were burning 20 minutes a day
manually re-assigning miscategorized leads. They wanted skill-based
routing. We shipped it in ~50 lines of edge function code.

The fallback rule matters: if no rep has the matching specialty,
the lead routes to *any* available rep — never lost. Most routing
systems drop leads on the floor when their rules don't match. We
won't.

Webhook payload now accepts:

  {
    "name": "Rohit",
    "phone": "9876543210",
    "specialty": "health-insurance",
    "source": "facebook"
  }

Case-insensitive. Free-text. Each tenant defines their own values.

This is the kind of thing that's invisible from a landing page but
makes or breaks a sales-ops workflow.

dialkaro.celerapps.com

#BuildInPublic #SaaS #SalesTech #IndianStartups
```

**Why this post works:**
- Specific (50 lines, 20 min/day saved)
- Technical credibility without being inaccessible
- Names a real pain (lead-loss) competitors don't address
- "Made in India" framing without the cliché

---

## Post 3 — Day 7 (use-case story, builds personality)

```
A scenario we keep seeing:

A 12-rep DSA team in Pune. They run Meta Lead Ads + IndiaMART +
a website form. ~200 leads per day across all sources.

Before DialKaro:
▸ Owner exports 3 spreadsheets every morning
▸ Manually splits leads across 12 reps in WhatsApp groups
▸ Reps copy-paste numbers into their phone dialer
▸ EOD reports come in at midnight, half are wrong
▸ ~30% of leads never get a single call (lost in groups)

After DialKaro:
▸ Webhook receives every lead in <60 seconds
▸ Specialty-based routing assigns them automatically
▸ Reps open the app, click dial, mark outcome, next
▸ Claude AI sends owner a session summary at 7pm daily
▸ Lead-loss drops from 30% → under 3%

Same 12 reps. ~3× the connections. Zero spreadsheets.

The math: if your team handles 200 leads/day at a 30% loss rate,
you're leaving 60 leads / day on the floor. At a 2% close rate
and ₹X/customer, that's real money.

This is what DialKaro does.

Demo: dialkaro.celerapps.com (60-sec Loom in the page banner)
Or WhatsApp +91-XXXXXXXXXX, "DEMO" — I'll set up your tenant.

#SalesOps #SaaS #IndianStartups #DSA #MadeInIndia
```

**Why this post works:**
- Specific persona (12-rep DSA in Pune)
- Quantified pain (30% loss, ₹X/lost lead)
- Clear before/after
- Soft CTA ending — WhatsApp not "book a call" (Indian buyers prefer)

---

## Posting checklist

- [ ] Copy text into LinkedIn "Posting as: DialKaro" mode
- [ ] Add the **Loom thumbnail or screenshot** as image (posts with images get 2× reach)
- [ ] First comment from the page: a follow-up link (LinkedIn algo penalizes external links in main post — put them in first comment)
- [ ] Engagement window: respond to every comment for 24 hours
- [ ] Boost: ask 3-5 friends to like + comment in first 60 min
- [ ] Cross-post to your CelerApps parent page on Day 1 only (don't spam)

---

## What to do AFTER these 3 posts

Continue 3×/week. Future post buckets to rotate:

1. **Build-in-public** (every Mon) — what shipped, what failed
2. **Customer story** (every Wed) — real or composite
3. **Industry take** (every Fri) — your opinion on a SalesTech / Indian-SMB topic

After 4 weeks of posting, you'll have **12 posts** — enough to start
analyzing which buckets get the most engagement, then double down.
