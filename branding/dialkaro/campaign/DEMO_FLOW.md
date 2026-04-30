# DialKaro — Live Demo Playbook (15 Minutes)

> **Goal**: Convert prospect to free-trial signup during the demo.
> **Tone**: Calm, confident, curious. Let them talk 40% of the time.
> **Rule**: Never present features. Present their problems, then show how DialKaro solves them.

---

## Pre-Demo Checklist (5 min before)

- [ ] Open DialKaro in Chrome incognito (clean, no extensions)
- [ ] Login to **demo tenant** with sample data pre-loaded
- [ ] Have [`demo-sample-leads.csv`](../demo-sample-leads.csv) in Downloads
- [ ] Close all other tabs
- [ ] DND on, notifications off
- [ ] Have their company name + team size noted
- [ ] Open this script on second screen or phone

---

## The Demo Structure

### [0:00 - 2:00] Pain Discovery (DO NOT SKIP)

**Start by asking, not showing.**

> *"Before I show you anything — quick question. Right now, when a new lead comes in from [their source], what happens next? Walk me through the exact steps."*

**Listen for these pain signals:**

| They Say | You Note |
|----------|----------|
| "We put it in a WhatsApp group" | ✅ Lead leakage problem |
| "My manager assigns them manually" | ✅ Routing bottleneck |
| "Reps pick their own leads" | ✅ Cherry-picking, uneven distribution |
| "We use an Excel sheet" | ✅ Copy-paste workflow |
| "Some leads don't get called" | ✅ Perfect — this is THE pain |
| "We already have a CRM" | ⚠️ Need to position as complement, not replacement |

**Follow-up question:**

> *"And if I asked you right now — what percentage of yesterday's leads got a call within the first hour? Would you know?"*

(They almost never know. This creates the opening.)

---

### [2:00 - 5:00] Live Upload → Instant Dial

**Transition:**

> *"Let me show you how this changes. I'm going to upload a spreadsheet right now — same kind your team uses."*

**Demo steps:**
1. Drag-drop `demo-sample-leads.csv` onto the upload zone
2. Show column mapping (auto-detected)
3. Click "Start Dialing"
4. Show the contact card — name, number, note
5. Click **📞 Phone** → show how it initiates the call
6. Click **📲 WhatsApp** → show WhatsApp deep-link with pre-filled message

**What to say:**

> *"One click — phone call. One click — WhatsApp. No copy-paste, no switching apps. Your rep goes from lead to dial in under 2 seconds."*

---

### [5:00 - 8:00] Outcomes + AI Summary

**Demo steps:**
1. Mark outcome → "Interested" → show green highlight
2. Mark another → "Callback" → show it auto-prompts for callback date
3. Skip one → show skip tracking
4. Click **🤖 AI Summary** → show Claude generating the session summary

**What to say:**

> *"At the end of the day, Claude AI reads every call outcome and writes a one-paragraph summary. What worked, who to chase tomorrow, who to drop. Your managers get this instead of asking 'So how was today?' in WhatsApp."*

---

### [8:00 - 10:00] Admin Dashboard

**Transition:**

> *"Now let me show you what the manager sees."*

**Demo steps:**
1. Switch to Admin Panel
2. Show Users tab — all reps, their status, registration date
3. Show Analytics tab — call volume chart, outcome breakdown
4. Show Leaderboard — ranked by calls + conversion %
5. Show Leads tab — webhook setup, auto-captured leads

**What to say:**

> *"Every call, every outcome, every rep — visible in real time. No more asking for EOD reports. And new leads from your website or Meta Ads flow in automatically via webhook — assigned to the right rep by specialty."*

---

### [10:00 - 12:00] Pricing + Value Anchor

**Transition:**

> *"Let me talk numbers for a second."*

**Value anchor (ALWAYS do this before showing price):**

> *"You mentioned you get about [X] leads per day. If even 20% of those aren't getting called — that's [X × 0.2] leads per day lost. At your average deal value of ₹[Y], that's ₹[X × 0.2 × Y] per month walking out the door."*
>
> *"DialKaro costs a fraction of that."*

**Then share pricing** (from [`PRICING_PLAYBOOK.md`](PRICING_PLAYBOOK.md)):

| Plan | Price | Includes |
|------|-------|----------|
| Starter (up to 5 reps) | ₹2,499/month | All features |
| Growth (up to 15 reps) | ₹4,999/month | All features + priority support |
| Scale (up to 50 reps) | ₹9,999/month | All features + dedicated onboarding |

> *"And you can try it free for 14 days. Full features, no card required."*

---

### [12:00 - 15:00] Close + Next Steps

**The close (pick based on temperature):**

**Hot (they're nodding, asking about setup):**
> *"Want me to set up your tenant right now? Takes 5 minutes. You give me your team code and we're live."*

**Warm (interested but not committing):**
> *"How about this — I'll set up a free trial right now, you share the link with 2-3 of your reps, and let them use it for a day. If it doesn't save them time, just don't log in again. No obligation."*

**Cool (skeptical, asking many questions):**
> *"Totally get it — take a day to think about it. I'll send you the Loom video so you can share with your team. If you want to try it, just reply DEMO on WhatsApp and I'll set it up in 5 minutes."*

---

## Objection Handling Cheat Sheet

| Objection | Response |
|-----------|----------|
| "We already have a CRM" | "DialKaro doesn't replace your CRM — it replaces the 30 minutes your reps spend copying numbers from the CRM into their phone. Export from CRM → upload → dial." |
| "It's too expensive" | "How much are you losing per month from uncalled leads? If it's more than ₹2,499, DialKaro pays for itself on Day 1." |
| "We're too small" | "DialKaro works best at 3-15 reps. That's exactly your size. Larger teams need Salesforce — you don't." |
| "My reps won't adopt it" | "That's exactly why we built it as a web app — no installation, works on any phone. And the WhatsApp button is the first thing they'll love." |
| "We need [feature X]" | "Tell me more about X — if it's something 3+ customers want, we ship it within 2 weeks. We're small and fast." |
| "Can I get a discount?" | "For our first 10 customers, we're offering early-adopter pricing that locks in forever. Let me check if a slot is available." |
| "Let me think about it" | "Of course. I'll set up a free tenant anyway — takes 2 minutes. Use it for 14 days. If it doesn't help, just don't log in. No follow-up, no spam." |
| "We tried a dialer before" | "Which one? (listen) — Most Indian teams try American dialers that don't support WhatsApp or +91 formats. That's exactly why we built DialKaro." |

---

## Post-Demo Follow-Up (within 1 hour)

### If they signed up:

```
WhatsApp message:

Hi {Name}! 🎉

Your DialKaro tenant is live:

🌐 URL: https://dialkaro.celerapps.com
📋 Team Code: {CODE}
🔑 Admin: admin / {password}

Share the team code with your reps so they can register.

Need help? Just message me here. 🙏

— DialKaro Team
```

### If they didn't sign up:

```
WhatsApp message:

Hi {Name}, thanks for the demo today! 🙏

Quick recap:
✅ Excel upload → auto-dial in 2 seconds
✅ Phone + WhatsApp from one screen
✅ AI summaries — no more EOD spreadsheets
✅ Webhook routing — leads auto-assigned

60-sec video if you want to share with your team: {Loom link}

Reply DEMO anytime — I'll set up your free trial in 5 min.
No pressure, no follow-up. Just here when you're ready.
```

### If no reply in 3 days:

```
Hi {Name} — last ping 🙏

Would it help if I set up a free trial with YOUR actual lead data?
Send me 10 sample leads (name + phone) and I'll load them in.
You can test with real calls — see if it actually saves time.

Reply STOP and I'll never message again.
```
