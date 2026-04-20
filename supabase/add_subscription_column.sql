-- Add subscription_end column to tenants table
-- Run in Supabase SQL Editor
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_end DATE;

-- Verify
SELECT slug, app_name, team_code, subscription_end FROM tenants;
