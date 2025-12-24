-- Migration: Link Output Profiles to Input Profiles
-- Adds a foreign key so output profiles can reference their source input profile
-- This enables smarter UI with field autocomplete

-- Add the foreign key column (optional, so existing profiles still work)
ALTER TABLE output_profiles 
ADD COLUMN IF NOT EXISTS input_profile_id UUID REFERENCES input_profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_output_profiles_input_profile 
ON output_profiles(input_profile_id) WHERE input_profile_id IS NOT NULL;
