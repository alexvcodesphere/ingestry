-- Migration: Simplify Configuration
-- Renames colour → color everywhere
-- Renames code_lookups.type → field_key
-- Does NOT create field_definitions (fields stay per-profile in processing_profiles)

------------------------------------------------------------
-- Step 1: Rename colour → color in code_lookups
------------------------------------------------------------
UPDATE code_lookups SET type = 'color' WHERE type = 'colour';

------------------------------------------------------------
-- Step 2: Rename code_lookups.type → field_key
------------------------------------------------------------
ALTER TABLE code_lookups RENAME COLUMN type TO field_key;

-- Update indexes
DROP INDEX IF EXISTS idx_code_lookups_type;
DROP INDEX IF EXISTS idx_code_lookups_type_code;
CREATE INDEX IF NOT EXISTS idx_code_lookups_field_key ON code_lookups(field_key);
CREATE INDEX IF NOT EXISTS idx_code_lookups_field_key_code ON code_lookups(field_key, code);

-- Update unique constraint
ALTER TABLE code_lookups DROP CONSTRAINT IF EXISTS code_lookups_type_name_key;
ALTER TABLE code_lookups ADD CONSTRAINT code_lookups_field_key_name_key UNIQUE(field_key, name);

------------------------------------------------------------
-- Step 3: Update sku_templates to use color instead of colour
------------------------------------------------------------
UPDATE sku_templates 
SET template = REPLACE(template, '{colour', '{color');

------------------------------------------------------------
-- Step 4: Update processing_profiles.fields JSONB
------------------------------------------------------------
-- Replace normalize_with: "colour" → "color"
UPDATE processing_profiles
SET fields = (
    SELECT jsonb_agg(
        CASE 
            WHEN elem->>'normalize_with' = 'colour' 
            THEN jsonb_set(elem, '{normalize_with}', '"color"')
            ELSE elem
        END
    )
    FROM jsonb_array_elements(fields) elem
)
WHERE fields::text LIKE '%colour%';

-- Update sku_template
UPDATE processing_profiles
SET sku_template = REPLACE(sku_template, '{colour', '{color')
WHERE sku_template LIKE '%colour%';
