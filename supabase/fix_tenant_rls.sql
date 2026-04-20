-- ═══════════════════════════════════════════════════════════
--  FIX: Add UPDATE and INSERT policies for tenants table
--  Run this in Supabase SQL Editor
--  This allows the Super Admin panel to modify tenant settings
-- ═══════════════════════════════════════════════════════════

-- Add subscription_end column if not exists
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end DATE;

-- Allow anyone to read tenants (already exists, but safe to re-add)
DROP POLICY IF EXISTS "Tenants are publicly readable" ON tenants;
CREATE POLICY "Tenants are publicly readable"
  ON tenants FOR SELECT USING (true);

-- Allow inserts (for Add Tenant from super admin panel)
DROP POLICY IF EXISTS "Allow tenant inserts" ON tenants;
CREATE POLICY "Allow tenant inserts"
  ON tenants FOR INSERT WITH CHECK (true);

-- Allow updates (for editing team code, max reps, subscription, disable/enable)
DROP POLICY IF EXISTS "Allow tenant updates" ON tenants;
CREATE POLICY "Allow tenant updates"
  ON tenants FOR UPDATE USING (true);

-- Verify policies
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'tenants';
