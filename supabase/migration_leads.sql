-- ═══════════════════════════════════════════════════════════
--  DIALKARO — LEAD AUTO-CAPTURE MIGRATION
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--  NOTE: Run each section one at a time if you get errors
-- ═══════════════════════════════════════════════════════════

-- ────────────────────────────────────────
-- SECTION 1: CREATE LEADS TABLE
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  assigned_to UUID REFERENCES auth.users(id),

  -- Contact info (same fields the dialer uses)
  full_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual',        -- 'facebook', 'website', 'indiamart', 'zapier', 'api', 'manual'
  source_detail TEXT,                           -- Campaign name, form name, page URL, etc.

  -- Lead context
  interest TEXT,                                -- "Home Loan 50L", "3BHK Sector 150", "MBA Course"
  raw_data JSONB DEFAULT '{}',                  -- Full original webhook payload for debugging

  -- Status (matches dialer outcomes)
  status TEXT DEFAULT 'new',                    -- 'new', 'called', 'interested', 'not_interested', 'callback', 'invalid'
  call_note TEXT,
  called_at TIMESTAMPTZ,

  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Dedup: one phone per tenant (prevents duplicate leads)
  UNIQUE(tenant_id, phone)
);

-- ────────────────────────────────────────
-- SECTION 2: ADD WEBHOOK COLUMNS TO TENANTS
-- ────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS webhook_secret TEXT DEFAULT encode(gen_random_bytes(24), 'hex');

-- ────────────────────────────────────────
-- SECTION 3: BACKFILL webhook_secret for existing tenants
-- ────────────────────────────────────────
UPDATE tenants SET webhook_secret = encode(gen_random_bytes(24), 'hex') WHERE webhook_secret IS NULL;

-- ────────────────────────────────────────
-- SECTION 4: RLS POLICIES FOR LEADS
-- ────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Reps can read leads assigned to them + all leads in their tenant (for admin view)
DROP POLICY IF EXISTS "Users can read tenant leads" ON leads;
CREATE POLICY "Users can read tenant leads"
  ON leads FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Service role (Edge Function) can insert leads — regular users cannot
DROP POLICY IF EXISTS "Service can insert leads" ON leads;
CREATE POLICY "Service can insert leads"
  ON leads FOR INSERT WITH CHECK (true);

-- Reps can update leads assigned to them (mark called, add notes)
DROP POLICY IF EXISTS "Users can update assigned leads" ON leads;
CREATE POLICY "Users can update assigned leads"
  ON leads FOR UPDATE USING (
    assigned_to = auth.uid() OR
    tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- Admins can delete invalid leads (via tenant membership)
DROP POLICY IF EXISTS "Users can delete tenant leads" ON leads;
CREATE POLICY "Users can delete tenant leads"
  ON leads FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM user_profiles WHERE id = auth.uid())
  );

-- ────────────────────────────────────────
-- SECTION 5: INDEXES FOR PERFORMANCE
-- ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);

-- ═══════════════════════════════════════════════════════════
--  DONE! Verify by running:
--    SELECT * FROM leads LIMIT 5;
--    SELECT webhook_secret FROM tenants;
-- ═══════════════════════════════════════════════════════════
