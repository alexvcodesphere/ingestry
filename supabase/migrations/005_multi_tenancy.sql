-- Migration: Multi-Tenancy + Custom Lookup Types
-- Adds tenant isolation and user-defined lookup types

------------------------------------------------------------
-- Tenants
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Simple model: one user belongs to exactly one tenant
-- Store tenant_id directly on auth.users metadata or use a junction table
CREATE TABLE IF NOT EXISTS tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id)  -- One user = one tenant
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant ON tenant_members(tenant_id);

------------------------------------------------------------
-- Lookup Types (per-tenant)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lookup_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,                   -- e.g., "material", "collection"
    label TEXT NOT NULL,                  -- e.g., "Materials"
    description TEXT,
    is_system BOOLEAN DEFAULT false,      -- System types seeded on tenant creation
    variable_name TEXT,                   -- For SKU templates: {material}
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_lookup_types_tenant ON lookup_types(tenant_id);

------------------------------------------------------------
-- Add tenant_id to existing tables
------------------------------------------------------------

-- code_lookups
ALTER TABLE code_lookups 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_code_lookups_tenant ON code_lookups(tenant_id);

-- suppliers (for Brands tab)
ALTER TABLE suppliers 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- draft_orders
ALTER TABLE draft_orders 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_draft_orders_tenant ON draft_orders(tenant_id);

-- sku_templates
ALTER TABLE sku_templates 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_sku_templates_tenant ON sku_templates(tenant_id);

-- extraction_profiles
ALTER TABLE extraction_profiles 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_extraction_profiles_tenant ON extraction_profiles(tenant_id);

-- colors (for normalization)
ALTER TABLE colors 
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_colors_tenant ON colors(tenant_id);

------------------------------------------------------------
-- Create default tenant and migrate existing data
------------------------------------------------------------
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Store', 'default')
ON CONFLICT (slug) DO NOTHING;

-- Migrate existing data to default tenant
UPDATE code_lookups SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE draft_orders SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE sku_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE extraction_profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE colors SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Make tenant_id NOT NULL after migration
ALTER TABLE code_lookups ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE draft_orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sku_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE extraction_profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE colors ALTER COLUMN tenant_id SET NOT NULL;

------------------------------------------------------------
-- Seed default lookup types for the default tenant
------------------------------------------------------------
INSERT INTO lookup_types (tenant_id, slug, label, description, is_system, variable_name, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', 'brand', 'Brands', 'Brand/supplier mappings', true, 'brand', 1),
    ('00000000-0000-0000-0000-000000000001', 'category', 'Categories', 'Category codes for SKU', true, 'category', 2),
    ('00000000-0000-0000-0000-000000000001', 'colour', 'Colours', 'Colour codes for SKU', true, 'colour', 3),
    ('00000000-0000-0000-0000-000000000001', 'gender', 'Genders', 'Gender codes', true, 'gender', 4),
    ('00000000-0000-0000-0000-000000000001', 'season_type', 'Seasons', 'Season type codes', true, 'season', 5)
ON CONFLICT (tenant_id, slug) DO NOTHING;

------------------------------------------------------------
-- RLS Policies for tenant isolation
------------------------------------------------------------

-- Helper function to get current user's tenant
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Tenants: users can only see their own tenant
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own tenant" ON tenants;
CREATE POLICY "Users can view own tenant" ON tenants
    FOR SELECT USING (id = get_user_tenant_id());

-- Tenant members
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own membership" ON tenant_members;
CREATE POLICY "Users can view own membership" ON tenant_members
    FOR SELECT USING (user_id = auth.uid());

-- Lookup types
ALTER TABLE lookup_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON lookup_types;
CREATE POLICY "Tenant isolation" ON lookup_types
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- Code lookups
DROP POLICY IF EXISTS "Allow authenticated read" ON code_lookups;
DROP POLICY IF EXISTS "Tenant isolation" ON code_lookups;
CREATE POLICY "Tenant isolation" ON code_lookups
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- Suppliers
DROP POLICY IF EXISTS "Allow authenticated read" ON suppliers;
DROP POLICY IF EXISTS "Tenant isolation" ON suppliers;
CREATE POLICY "Tenant isolation" ON suppliers
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- Draft orders (keep user ownership, add tenant)
DROP POLICY IF EXISTS "Users can read own jobs" ON draft_orders;
DROP POLICY IF EXISTS "Tenant isolation" ON draft_orders;
CREATE POLICY "Tenant isolation" ON draft_orders
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- SKU templates
ALTER TABLE sku_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON sku_templates;
CREATE POLICY "Tenant isolation" ON sku_templates
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- Extraction profiles
ALTER TABLE extraction_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON extraction_profiles;
CREATE POLICY "Tenant isolation" ON extraction_profiles
    FOR ALL USING (tenant_id = get_user_tenant_id());

-- Colors
DROP POLICY IF EXISTS "Allow authenticated read" ON colors;
DROP POLICY IF EXISTS "Tenant isolation" ON colors;
CREATE POLICY "Tenant isolation" ON colors
    FOR ALL USING (tenant_id = get_user_tenant_id());

------------------------------------------------------------
-- Updated_at trigger for new tables
------------------------------------------------------------
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
