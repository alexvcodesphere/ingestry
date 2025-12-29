-- Migration: Fix Tenant Permissions and Isolation
-- Standardizes RLS across all tables and fixes the "default profile" issue

------------------------------------------------------------
-- 1. Fix 'jobs' Table
------------------------------------------------------------

-- Add tenant_id column (nullable first to allow backfill)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id based on the job creator (user_id)
UPDATE jobs
SET tenant_id = tm.tenant_id
FROM tenant_members tm
WHERE jobs.user_id = tm.user_id
AND jobs.tenant_id IS NULL;

-- If any jobs remain without a tenant (orphans), assign them to the Default Store
UPDATE jobs
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Now make it NOT NULL and default to the current user's tenant
ALTER TABLE jobs ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();
ALTER TABLE jobs ALTER COLUMN tenant_id SET NOT NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);

-- Update RLS Policy: Allow ALL tenant members to see ALL jobs in their tenant
DROP POLICY IF EXISTS "Users can read own jobs" ON jobs;
DROP POLICY IF EXISTS "Users can create jobs" ON jobs;
DROP POLICY IF EXISTS "Users can update own jobs" ON jobs;
DROP POLICY IF EXISTS "Tenant isolation" ON jobs;

CREATE POLICY "Tenant isolation" ON jobs
    FOR ALL USING (tenant_id = get_user_tenant_id());


------------------------------------------------------------
-- 2. Fix 'catalogues' Table
------------------------------------------------------------

-- Add tenant_id column
ALTER TABLE catalogues ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Backfill: Since catalogues have no user_id, assign all existing ones to Default Store
UPDATE catalogues
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Make NOT NULL and default to current user's tenant
ALTER TABLE catalogues ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();
ALTER TABLE catalogues ALTER COLUMN tenant_id SET NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_catalogues_tenant ON catalogues(tenant_id);

-- Update RLS Policy: strict tenant isolation instead of public access
DROP POLICY IF EXISTS "Allow authenticated read" ON catalogues;
DROP POLICY IF EXISTS "Tenant isolation" ON catalogues;

CREATE POLICY "Tenant isolation" ON catalogues
    FOR ALL USING (tenant_id = get_user_tenant_id());


------------------------------------------------------------
-- 3. Fix 'categories' Table
------------------------------------------------------------

-- Add tenant_id column
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Backfill to Default Store
UPDATE categories
SET tenant_id = '00000000-0000-0000-0000-000000000001'
WHERE tenant_id IS NULL;

-- Make NOT NULL and default
ALTER TABLE categories ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();
ALTER TABLE categories ALTER COLUMN tenant_id SET NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);

-- Update RLS Policy
DROP POLICY IF EXISTS "Allow authenticated read" ON categories;
DROP POLICY IF EXISTS "Tenant isolation" ON categories;

CREATE POLICY "Tenant isolation" ON categories
    FOR ALL USING (tenant_id = get_user_tenant_id());


------------------------------------------------------------
-- 4. Fix Unique Constraints for Defaults
------------------------------------------------------------

-- Fix SKU Templates: Drop global default index, create per-tenant default index
DROP INDEX IF EXISTS idx_sku_templates_default;
CREATE UNIQUE INDEX idx_sku_templates_tenant_default 
    ON sku_templates (tenant_id) 
    WHERE is_default = true;

-- Fix Extraction Profiles: Drop global default index, create per-tenant default index
DROP INDEX IF EXISTS idx_extraction_profiles_default;
CREATE UNIQUE INDEX idx_extraction_profiles_tenant_default 
    ON extraction_profiles (tenant_id) 
    WHERE is_default = true;

-- Fix Output Profiles: Drop global default index (if exists), create per-tenant default index
-- (Output profiles was already correct in migration 010, but reinforcing here to be safe)
DROP INDEX IF EXISTS idx_output_profiles_default; -- Just in case it was named this
CREATE UNIQUE INDEX IF NOT EXISTS idx_output_profiles_tenant_default 
    ON output_profiles (tenant_id) 
    WHERE is_default = true;

-- Fix Input Profiles (formerly Processing Profiles): Drop global default index, create per-tenant default index
-- Note: processing_profiles is now a VIEW, so we must alter the underlying table 'input_profiles'
DROP INDEX IF EXISTS idx_processing_profiles_default; -- Old index name on the table
DROP INDEX IF EXISTS idx_input_profiles_default; -- Possible new index name

CREATE UNIQUE INDEX IF NOT EXISTS idx_input_profiles_tenant_default 
    ON input_profiles (tenant_id) 
    WHERE is_default = true;

