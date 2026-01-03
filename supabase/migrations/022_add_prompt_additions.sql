-- Migration: Add prompt_additions column to input_profiles if missing
-- This column may have been lost during table renames

ALTER TABLE input_profiles 
ADD COLUMN IF NOT EXISTS prompt_additions TEXT;

COMMENT ON COLUMN input_profiles.prompt_additions IS 'Custom prompt additions for AI extraction';
