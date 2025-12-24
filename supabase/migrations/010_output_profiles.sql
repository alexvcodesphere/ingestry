-- Migration: Output Profiles & Rename Input Profiles
-- Adds output_profiles table for export configuration
-- Renames processing_profiles to input_profiles for consistency

------------------------------------------------------------
-- Rename processing_profiles → input_profiles
------------------------------------------------------------
-- Full table rename for consistency with Output Profiles naming
ALTER TABLE IF EXISTS processing_profiles RENAME TO input_profiles;

-- Rename the index
ALTER INDEX IF EXISTS idx_processing_profiles_tenant RENAME TO idx_input_profiles_tenant;

-- Create backwards-compatible VIEW for old table name (optional, for migration safety)
CREATE OR REPLACE VIEW processing_profiles AS
SELECT * FROM input_profiles;

------------------------------------------------------------
-- Output Profiles Table
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS output_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Field mappings: source → target with optional templates
    -- Format: [{ "source": "sku", "target": "nummer", "template": null, "default_value": null }, ...]
    field_mappings JSONB NOT NULL DEFAULT '[]',
    
    -- Output format
    format TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json')),
    
    -- Format-specific options
    -- For CSV: { "delimiter": ";", "include_header": true, "column_order": [...] }
    -- For JSON: { "pretty": true }
    format_options JSONB NOT NULL DEFAULT '{"delimiter": ";", "include_header": true}',
    
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_output_profiles_tenant ON output_profiles(tenant_id);

------------------------------------------------------------
-- RLS Policies
------------------------------------------------------------
ALTER TABLE output_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON output_profiles;
CREATE POLICY "Tenant isolation" ON output_profiles
    FOR ALL USING (tenant_id = get_user_tenant_id());

------------------------------------------------------------
-- Updated_at trigger
------------------------------------------------------------
DROP TRIGGER IF EXISTS update_output_profiles_updated_at ON output_profiles;
CREATE TRIGGER update_output_profiles_updated_at
    BEFORE UPDATE ON output_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

------------------------------------------------------------
-- Seed Xentral CSV profile for existing tenants
------------------------------------------------------------
INSERT INTO output_profiles (tenant_id, name, description, field_mappings, format, format_options, is_default)
SELECT 
    t.id,
    'Xentral CSV',
    'CSV export format for Xentral ERP import',
    '[
        {"source": "sku", "target": "number"},
        {"source": "ean", "target": "ean"},
        {"source": "name", "target": "name_de"},
        {"source": "name", "target": "name_en"},
        {"source": "brand", "target": "hersteller"},
        {"source": "brand", "target": "manufacturer"},
        {"source": "article_number", "target": "supplier order number"},
        {"source": "supplier", "target": "supplier name"},
        {"source": "category", "target": "article_category_name"},
        {"source": "price", "target": "sale_price1net"},
        {"source": "color", "target": "colour"},
        {"source": "color", "target": "BaseColor"},
        {"source": "size", "target": "additionalText"},
        {"source": "gender", "target": "custom_field_3"},
        {"source": "season", "target": "custom_field_4"},
        {"source": "material", "target": "custom_field_7"}
    ]'::jsonb,
    'csv',
    '{"delimiter": ";", "include_header": true}'::jsonb,
    true
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM output_profiles op WHERE op.tenant_id = t.id
);
