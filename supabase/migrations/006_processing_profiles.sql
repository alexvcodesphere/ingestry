-- Migration: Processing Profiles
-- Unified configuration combining extraction fields, normalization, and SKU templates

------------------------------------------------------------
-- Processing Profiles Table
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS processing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Fields configuration: what to extract and how to normalize
    -- Format: [{ "key": "color", "label": "Color", "normalize_with": "colour" }, ...]
    fields JSONB NOT NULL DEFAULT '[]',
    
    -- SKU generation settings
    sku_template TEXT,
    generate_sku BOOLEAN DEFAULT false,
    
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_processing_profiles_tenant ON processing_profiles(tenant_id);

------------------------------------------------------------
-- RLS Policies
------------------------------------------------------------
ALTER TABLE processing_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON processing_profiles;
CREATE POLICY "Tenant isolation" ON processing_profiles
    FOR ALL USING (tenant_id = get_user_tenant_id());

------------------------------------------------------------
-- Updated_at trigger
------------------------------------------------------------
DROP TRIGGER IF EXISTS update_processing_profiles_updated_at ON processing_profiles;
CREATE TRIGGER update_processing_profiles_updated_at
    BEFORE UPDATE ON processing_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

------------------------------------------------------------
-- Migrate existing data (if any)
------------------------------------------------------------

-- Create default profile for existing tenants
INSERT INTO processing_profiles (tenant_id, name, description, fields, sku_template, is_default)
SELECT 
    t.id,
    'Default Profile',
    'Standard product extraction and SKU generation',
    '[
        {"key": "name", "label": "Product Name", "required": true},
        {"key": "color", "label": "Color", "normalize_with": "colour"},
        {"key": "size", "label": "Size"},
        {"key": "price", "label": "Price", "required": true},
        {"key": "quantity", "label": "Quantity", "required": true},
        {"key": "ean", "label": "EAN/Barcode"},
        {"key": "brand", "label": "Brand", "normalize_with": "brand"},
        {"key": "category", "label": "Category", "normalize_with": "category"},
        {"key": "sku", "label": "SKU"},
        {"key": "articleNumber", "label": "Article Number"},
        {"key": "styleCode", "label": "Style Code"},
        {"key": "designerCode", "label": "Designer Code"}
    ]'::jsonb,
    '{season}{brand:2}{gender}{category:2}{colour:2}{sequence:3}-{size}',
    true
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM processing_profiles pp WHERE pp.tenant_id = t.id
);
