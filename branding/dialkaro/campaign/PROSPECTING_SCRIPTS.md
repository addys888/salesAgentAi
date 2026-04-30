# DialKaro — Prospecting Scripts & Search Queries

> **Purpose**: Exact queries to find 200+ leads in 2-3 hours.
> **Rule**: Quality > quantity. Spend 30 sec qualifying each contact before adding.

---

## IndiaMART Prospecting

### Step-by-Step

1. Go to `indiamart.com`
2. Search using the queries below
3. Filter by city (start with your target city)
4. Click on seller profiles → extract: Company Name, Contact Person, Phone, City
5. Add to your tracker CSV

### Search Queries by Segment

**DSA / Loan Agents:**
```
"loan agent services"
"DSA franchise"  
"home loan services"
"personal loan agent"
"business loan consultant"
"credit card agent"
"loan DSA partner"
```

**Real Estate:**
```
"property dealer"
"real estate consultant"
"property broker services"
"flat for sale" (look at seller profiles, not listings)
"real estate agency"
```

**EdTech / Coaching:**
```
"coaching classes"
"education consultant"
"study abroad services"
"career counseling services"
"online education services"
```

### Qualifying on IndiaMART

✅ **Add to list if**:
- Profile shows a team (multiple people in photos)
- Has a physical office address
- Has been "verified" on IndiaMART
- Products suggest high-volume leads

❌ **Skip if**:
- Solo operator (1 person, home address)
- Hasn't been active in 6+ months
- No phone number listed

---

## JustDial Prospecting

### Step-by-Step

1. Go to `justdial.com`
2. Enter search term + city
3. Browse results — each listing shows: Business Name, Phone, Address, Rating
4. Click for details → extract contact info
5. Focus on listings with 4+ stars and "verified" badge

### Search Queries

**DSA / Loan Agents:**
```
"Loan agents in Mumbai"
"Home loan agents in Pune"
"Personal loan services in Delhi"
"DSA services in Hyderabad"
"Credit card agents in Bangalore"
```

**Real Estate:**
```
"Property dealers in [city]"
"Real estate brokers in [city]"
"Flat brokers in [city]"
"Commercial property agents in [city]"
```

**EdTech:**
```
"Coaching classes in [city]"
"IAS coaching in [city]"
"Study abroad consultants in [city]"
"Competitive exam coaching in [city]"
```

**Insurance:**
```
"Insurance agents in [city]"
"Health insurance agents in [city]"
"LIC agents in [city]"
```

### Pro Tip

JustDial shows phone numbers directly. Call them first to qualify:

> *"Hi, quick question — how many sales reps do you have on your team right now?"*

If < 3, skip. If 5+, add to your outreach list.

---

## LinkedIn Prospecting

### Free Search Queries

**DSA / Loan Agents:**
```
"DSA" "loan agent" India
"Direct Selling Agent" "home loan" 
"Principal Agent" "NBFC" India
```

**Real Estate:**
```
"Real estate broker" India "team"
"Property consultant" "sales team" India
"Real estate" "branch manager" India
```

**EdTech:**
```
"Admission counselor" "head" India
"EdTech" "sales manager" India
"Coaching" "admissions head" India
```

**Fintech / NBFC:**
```
"Inside sales" "NBFC" India
"Sales manager" "fintech" India
"Telecalling" "head" "lending" India
```

### LinkedIn Sales Navigator (if you have trial)

**Filter combo for best results:**
- Geography: India
- Industry: Financial Services / Real Estate / Education
- Company headcount: 11-50
- Seniority: Owner, VP, Director, Manager
- Keywords: "sales team" OR "lead management" OR "dialer"

### How to Extract from LinkedIn

1. **Don't scrape** — LinkedIn bans scrapers
2. Instead: manually visit profiles, note name + company + city
3. Cross-reference on JustDial/IndiaMART for phone numbers
4. Use Apollo.io free tier for email (50 credits/month)

---

## Apollo.io Prospecting (Free Tier)

### Step-by-Step

1. Sign up at `apollo.io` (free — 50 email credits/month)
2. Search → People
3. Apply filters:

**Best filter combo:**
```
Location: India
Job Titles: "Sales Manager", "VP Sales", "Head of Sales", "Inside Sales Manager"
Industry: Financial Services, Real Estate, Education
Company Size: 11-50 employees
```

4. Export to CSV (50/month on free plan)
5. You get: Name, Email, Company, Title, LinkedIn URL

### Alternative: Lusha (5 free credits/month)

Good for getting phone numbers when you only have a LinkedIn profile.

---

## Google Search Prospecting

### For finding smaller businesses not on LinkedIn

**DSA:**
```
"DSA franchise" site:justdial.com [city]
"home loan agent" "contact" [city]
"loan agent" "team" [city] -jobs
```

**Real Estate:**
```
"property dealer" "call" [city]
"real estate office" [city] "team of"
```

**EdTech:**
```
"coaching classes" [city] "admissions" "team"
"study abroad" [city] "counselors"
```

### Google Maps Search

1. Open Google Maps
2. Search: `"real estate office [city]"` or `"loan agent [city]"`
3. Browse results → each listing has: Name, Phone, Website, Address
4. Click through to website → look for team page / "About Us" to estimate team size

---

## Output Format

Save all prospects in this exact format (matches [`TRACKER_TEMPLATE.csv`](TRACKER_TEMPLATE.csv)):

```
Name,Phone,Company,Segment,City,Source,Channel,Stage,Next Action,Notes
Rajesh Sharma,9876543210,ABC Finance DSA,DSA,Mumbai,IndiaMART,WhatsApp,New,Send W1 template,Has 12 reps team
```

**Goal**: 200 contacts in 2-3 hours across all sources.

| Source | Time | Expected Contacts |
|--------|------|-------------------|
| IndiaMART | 45 min | 60 |
| JustDial | 45 min | 50 |
| LinkedIn | 30 min | 40 |
| Apollo.io | 15 min | 30 |
| Google/Maps | 15 min | 20 |
| **Total** | **~2.5 hours** | **200** |

---

## Legal Compliance

⚠️ **Stay within DPDP Act (Digital Personal Data Protection Act) limits:**

- Only use **publicly listed business contact information**
- Include **STOP opt-out** in every first message
- Never message personal phones that aren't publicly listed
- Keep a STOP list — never re-message anyone who opts out
- Don't use WhatsApp broadcast lists > 256 (use individual messages)
- Record consent for any phone calls
