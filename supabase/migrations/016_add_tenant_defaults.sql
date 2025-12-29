-- Migration: Add Default Tenant ID to All Tenant-Scoped Tables
-- Adds DEFAULT get_user_tenant_id() to all remaining tables to remove the need for client-side fetching.

-- 1. Draft Orders
ALTER TABLE draft_orders ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 2. Code Lookups
ALTER TABLE code_lookups ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();



-- 4. Input Profiles (formerly processing_profiles)
ALTER TABLE input_profiles ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 5. Output Profiles
ALTER TABLE output_profiles ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 6. Suppliers
ALTER TABLE suppliers ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 7. Colors
ALTER TABLE colors ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 8. Extraction Profiles
ALTER TABLE extraction_profiles ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 9. SKU Templates
ALTER TABLE sku_templates ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();

-- 10. Lookup Column Definitions
ALTER TABLE lookup_column_defs ALTER COLUMN tenant_id SET DEFAULT get_user_tenant_id();
