-- Migration: Unified Profiles
-- Merges output_profiles into input_profiles as export_configs JSONB
-- Implements Relational Fallback: creates "Legacy Export - [Name]" for unlinked profiles

------------------------------------------------------------
-- Step 1: Add new columns to input_profiles
------------------------------------------------------------
ALTER TABLE input_profiles
ADD COLUMN IF NOT EXISTS export_configs JSONB NOT NULL DEFAULT '[]';

ALTER TABLE input_profiles
ADD COLUMN IF NOT EXISTS default_export_config_idx INTEGER DEFAULT 0;

------------------------------------------------------------
-- Step 2: Migrate LINKED output_profiles (have input_profile_id)
------------------------------------------------------------
WITH linked_exports AS (
    SELECT 
        op.input_profile_id,
        jsonb_agg(
            jsonb_build_object(
                'id', op.id,
                'name', op.name,
                'shop_system', COALESCE(
                    CASE 
                        WHEN op.name ILIKE '%xentral%' THEN 'xentral'
                        WHEN op.name ILIKE '%shopware%' THEN 'shopware'
                        WHEN op.name ILIKE '%shopify%' THEN 'shopify'
                        ELSE 'xentral'
                    END,
                    'xentral'
                ),
                'field_mappings', op.field_mappings,
                'format', op.format,
                'format_options', op.format_options,
                'is_default', op.is_default
            )
            ORDER BY op.is_default DESC, op.created_at ASC
        ) AS configs
    FROM output_profiles op
    WHERE op.input_profile_id IS NOT NULL
    GROUP BY op.input_profile_id
)
UPDATE input_profiles ip
SET export_configs = le.configs
FROM linked_exports le
WHERE ip.id = le.input_profile_id;

------------------------------------------------------------
-- Step 3: Relational Fallback - Create profiles for UNLINKED outputs
------------------------------------------------------------
-- Insert new input_profiles for each unlinked output_profile
INSERT INTO input_profiles (tenant_id, name, description, fields, is_default, export_configs, default_export_config_idx)
SELECT 
    op.tenant_id,
    'Legacy Export - ' || op.name,
    'Auto-created during profile unification. Contains export config from: ' || op.name,
    '[]'::jsonb,  -- Empty extraction fields
    false,
    jsonb_build_array(
        jsonb_build_object(
            'id', op.id,
            'name', op.name,
            'shop_system', COALESCE(
                CASE 
                    WHEN op.name ILIKE '%xentral%' THEN 'xentral'
                    WHEN op.name ILIKE '%shopware%' THEN 'shopware'
                    WHEN op.name ILIKE '%shopify%' THEN 'shopify'
                    ELSE 'xentral'
                END,
                'xentral'
            ),
            'field_mappings', op.field_mappings,
            'format', op.format,
            'format_options', op.format_options,
            'is_default', true
        )
    ),
    0
FROM output_profiles op
WHERE op.input_profile_id IS NULL;

------------------------------------------------------------
-- Step 4: Drop output_profiles table
------------------------------------------------------------
DROP TABLE IF EXISTS output_profiles CASCADE;

------------------------------------------------------------
-- Step 5: Drop legacy processing_profiles view
------------------------------------------------------------
DROP VIEW IF EXISTS processing_profiles;

------------------------------------------------------------
-- Step 6: Create backwards-compatible view (optional, for transition)
------------------------------------------------------------
-- This view allows old code referencing processing_profiles to still work
CREATE OR REPLACE VIEW processing_profiles AS
SELECT 
    id,
    tenant_id,
    name,
    description,
    fields,
    sku_template,
    generate_sku,
    is_default,
    export_configs,
    default_export_config_idx,
    created_at,
    updated_at
FROM input_profiles;

COMMENT ON VIEW processing_profiles IS 'Backwards-compatible view for unified profiles. Use input_profiles directly.';
