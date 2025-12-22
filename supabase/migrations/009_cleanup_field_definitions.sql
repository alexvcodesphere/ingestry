-- Migration 009: Clean up field_definitions table
-- The previous migration (008) already:
--   - Renamed type → field_key
--   - Renamed colour → color
-- This migration just removes the unneeded field_definitions table

-- Drop field_definitions table (not needed - fields are per-profile)
DROP TABLE IF EXISTS field_definitions CASCADE;

-- Also drop lookup_types if it still exists (replaced by field_key in code_lookups)
DROP TABLE IF EXISTS lookup_types CASCADE;
