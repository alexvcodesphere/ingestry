-- Migration: Add custom columns support to code_lookups
-- Adds extra_data JSONB column for custom fields
-- Adds lookup_column_defs table to define custom columns per field_key

------------------------------------------------------------
-- 1. Add extra_data JSONB column to code_lookups
------------------------------------------------------------
ALTER TABLE code_lookups ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';

COMMENT ON COLUMN code_lookups.extra_data IS 'Custom column values as JSON object, e.g., {"xentral_code": "123", "shopware_id": "abc"}';

------------------------------------------------------------
-- 2. Create table to define custom columns per field_key
-- This allows users to add extra columns beyond name/code/aliases
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lookup_column_defs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    field_key TEXT NOT NULL,
    column_key TEXT NOT NULL,
    column_label TEXT NOT NULL,
    column_type TEXT DEFAULT 'text' CHECK (column_type IN ('text', 'number', 'boolean')),
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (tenant_id, field_key, column_key)
);

CREATE INDEX IF NOT EXISTS idx_lookup_column_defs_tenant ON lookup_column_defs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lookup_column_defs_field_key ON lookup_column_defs(field_key);

-- Enable RLS
ALTER TABLE lookup_column_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON lookup_column_defs;
CREATE POLICY "Tenant isolation" ON lookup_column_defs
    USING (tenant_id = get_user_tenant_id())
    WITH CHECK (tenant_id = get_user_tenant_id());

------------------------------------------------------------
-- 3. Seed default columns (marked is_default=true so they can't be deleted)
-- These are the standard columns that always exist
------------------------------------------------------------
-- Note: name, code, aliases are built-in columns, not stored here
-- The lookup_column_defs table is only for EXTRA custom columns

COMMENT ON TABLE lookup_column_defs IS 'Defines extra custom columns for code_lookups entries per field_key. name/code/aliases are built-in.';
