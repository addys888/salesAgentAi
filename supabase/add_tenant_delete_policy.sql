-- ═══════════════════════════════════════════════════════════
--  FIX: Add DELETE policy for tenants table
--  Enables the Super Admin "Delete Tenant" inline action.
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════════════════════

-- Allow deletes on tenants (super admin panel uses anon key, RLS must permit it)
DROP POLICY IF EXISTS "Allow tenant deletes" ON tenants;
CREATE POLICY "Allow tenant deletes"
  ON tenants FOR DELETE USING (true);

-- Verify all tenant policies are in place
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'tenants'
ORDER BY cmd;
