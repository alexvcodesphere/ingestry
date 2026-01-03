-- Migration: Rename lookups to catalogs
-- Renames code_lookups → catalog_entries and lookup_column_defs → catalog_fields

-- Rename main lookup table
ALTER TABLE code_lookups RENAME TO catalog_entries;

-- Rename column definitions table
ALTER TABLE lookup_column_defs RENAME TO catalog_fields;

-- Rename indices (if they exist)
DO $$
BEGIN
    -- Rename index on field_key
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_code_lookups_field_key') THEN
        ALTER INDEX idx_code_lookups_field_key RENAME TO idx_catalog_entries_field_key;
    END IF;
    
    -- Rename index on tenant_id
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_code_lookups_tenant') THEN
        ALTER INDEX idx_code_lookups_tenant RENAME TO idx_catalog_entries_tenant;
    END IF;
    
    -- Rename index on lookup_column_defs
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_lookup_column_defs_tenant') THEN
        ALTER INDEX idx_lookup_column_defs_tenant RENAME TO idx_catalog_fields_tenant;
    END IF;
END $$;

-- Note: RLS policies are renamed automatically when the table is renamed
