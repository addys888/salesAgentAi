# DialKaro Lead Auto-Capture — Setup Guide

## Option 1: Website Form Snippet

Paste this snippet on any website to auto-capture form submissions into DialKaro.

### Step 1: Add the script (before `</body>`)

```html
<!-- DialKaro Lead Capture -->
<script>
(function() {
  var WH = "YOUR_WEBHOOK_URL";   // Get from Admin → Leads tab
  var SK = "YOUR_WEBHOOK_SECRET"; // Get from Admin → Leads tab
  document.querySelectorAll("form[data-dialkaro]").forEach(function(f) {
    f.addEventListener("submit", function(e) {
      e.preventDefault();
      var btn = f.querySelector('button[type="submit"]');
      if(btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      var d = Object.fromEntries(new FormData(f));
      d.secret = SK;
      fetch(WH, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(d)
      }).then(function(r) {
        f.reset();
        if(btn) { btn.disabled = false; btn.textContent = "✓ Submitted!"; }
        setTimeout(function(){ if(btn) btn.textContent = "Request Callback"; }, 2000);
      }).catch(function() {
        if(btn) { btn.disabled = false; btn.textContent = "Try Again"; }
      });
    });
  });
})();
</script>
```

### Step 2: Add `data-dialkaro` to your form

```html
<form data-dialkaro>
  <input name="name" placeholder="Your Name" required>
  <input name="phone" placeholder="Phone Number" required>
  <input name="email" placeholder="Email">
  <input name="interest" placeholder="I am interested in...">
  <button type="submit">Request Callback</button>
</form>
```

**Field names supported:** `name`, `full_name`, `phone`, `phone_number`, `mobile`, `email`, `interest`, `product`, `message`, `requirement`, `source`, `campaign`

---

## Option 2: Zapier / Pabbly Connect

### Setup Steps:
1. Create a new Zap or Pabbly Flow
2. **Trigger:** Choose your lead source (Facebook Lead Ads, Google Forms, TypeForm, website form, etc.)
3. **Action:** "Webhooks by Zapier" → "POST"
4. **URL:** Your webhook URL (from DialKaro Admin → Leads tab)
5. **Payload Type:** JSON
6. **Data fields:**
   - `secret`: Your webhook secret
   - `name`: Map to lead's name field
   - `phone`: Map to lead's phone field
   - `email`: Map to lead's email field
   - `interest`: Map to any relevant field
   - `source`: Set to `zapier` or `pabbly`
7. **Test & Turn On!**

---

## Option 3: Direct API (Custom Integration)

Send a POST request to your webhook URL:

```bash
curl -X POST "YOUR_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "YOUR_WEBHOOK_SECRET",
    "name": "Rajesh Sharma",
    "phone": "9876543210",
    "email": "rajesh@example.com",
    "interest": "Home Loan 50L",
    "source": "api"
  }'
```

**Response (success):**
```json
{ "status": "ok", "message": "Lead captured successfully" }
```

**Response (duplicate):**
```json
{ "status": "duplicate", "message": "Lead with this phone already exists" }
```

---

## How It Works

1. Lead submits form → Your webhook URL receives the data
2. DialKaro normalizes the phone number and deduplicates
3. Lead is auto-assigned to the rep with fewest pending leads (round-robin)
4. Rep opens DialKaro → sees "📥 Load from Leads (3 new)" button
5. Rep calls, tags outcome → Result synced back to leads table
6. Admin can view all leads in Admin Panel → Leads tab

## Security

- Every tenant gets a unique `webhook_secret`
- The secret must be included in every request (in body or `X-Webhook-Secret` header)
- Without the correct secret, the webhook rejects the request
- Phone numbers are deduplicated per tenant — same number won't create duplicate leads
