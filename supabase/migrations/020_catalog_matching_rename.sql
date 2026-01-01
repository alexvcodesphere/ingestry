-- Migration: Rename normalize_with to catalog_key in input_profiles.fields JSON
-- This changes the field configuration property from "normalize_with" to "catalog_key"
-- to align with the new "Match with Catalog" UI convention.

UPDATE input_profiles
SET fields = (
    SELECT jsonb_agg(
        CASE 
            WHEN elem ? 'normalize_with' 
            THEN (elem - 'normalize_with') || jsonb_build_object('catalog_key', elem->'normalize_with')
            ELSE elem
        END
    )
    FROM jsonb_array_elements(fields) AS elem
)
WHERE fields IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(fields) AS elem 
    WHERE elem ? 'normalize_with'
  );

-- Note: No migration needed for draft_orders.metadata.profile_fields
-- Old orders will simply show "No Catalog" for legacy fields without catalog_key.
-- The UI gracefully handles missing keys.
