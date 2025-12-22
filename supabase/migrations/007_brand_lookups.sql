-- Migration: Add brand lookup data to code_lookups
-- Migrates brand data from legacy suppliers table format to unified code_lookups format
-- This allows brands to use aliases just like other lookup types

-- First, add a unique constraint that includes tenant_id if it doesn't exist
-- (The original UNIQUE(type, name) needs to be updated for multi-tenancy)
DO $$
BEGIN
    -- Drop the old constraint if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'code_lookups_type_name_key'
    ) THEN
        ALTER TABLE code_lookups DROP CONSTRAINT code_lookups_type_name_key;
    END IF;
    
    -- Create the new constraint including tenant_id (if it doesn't already exist)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'code_lookups_tenant_type_name_key'
    ) THEN
        ALTER TABLE code_lookups 
        ADD CONSTRAINT code_lookups_tenant_type_name_key UNIQUE (tenant_id, type, name);
    END IF;
END $$;

-- Seed the brand lookup type if not exists
INSERT INTO lookup_types (tenant_id, slug, label, description, variable_name, is_system, sort_order)
SELECT 
    (SELECT id FROM tenants LIMIT 1),
    'brand',
    'Brands',
    'Brand/supplier names for SKU generation',
    'brand',
    true,
    1
WHERE NOT EXISTS (
    SELECT 1 FROM lookup_types WHERE slug = 'brand'
);

-- Insert brand data into code_lookups
-- Format: name = brand_name (display name), code = brand_code (for SKU)
-- Aliases can include supplier_name and common variations
INSERT INTO code_lookups (tenant_id, type, name, code, aliases, sort_order)
SELECT 
    (SELECT id FROM tenants LIMIT 1),
    'brand',
    name,
    code,
    aliases,
    sort_order
FROM (VALUES
    ('Acne Studios', 'AC', ARRAY['ACNE STUDIOS AB'], 1),
    ('032c', 'ZC', ARRAY['032C System GmbH'], 2),
    ('A Kind of Guise', 'AK', ARRAY['AKOG SERVICE GMBH'], 3),
    ('A. Roege Hove', 'RH', ARRAY['ROEGE & CO ApS'], 4),
    ('Carhartt WIP', 'CH', ARRAY['Work in Progress Textilhandels GmbH', 'Carhartt'], 5),
    ('Carne Bollente', 'CB', ARRAY['CARNE CORP SAS'], 6),
    ('Chopova Lowena', 'CL', ARRAY['CHOPOVA LOWENA LTD'], 7),
    ('Christina Seewald', 'CS', ARRAY['Christina Seewald'], 8),
    ('Diesel', 'DI', ARRAY['Diesel Spa'], 9),
    ('Dries Van Noten', 'DV', ARRAY['VAN NOTEN ANDRIES N.V.'], 10),
    ('Brain Dead', 'BD', ARRAY['Gimme5 B.V.'], 11),
    ('Jacquemus', 'JQ', ARRAY['JACQUEMUS SAS'], 12),
    ('Jil Sander', 'JS', ARRAY['Jil Sander S.p.A.'], 13),
    ('Lemaire', 'LE', ARRAY['JINGHI SAS'], 14),
    ('Maison Margiela', 'MM', ARRAY['MARGIELA S.A.S.', 'Margiela'], 15),
    ('Our Legacy', 'OL', ARRAY['Selftitled AB'], 16),
    ('Prada', 'PR', ARRAY['Prada SpA'], 17),
    ('Raf Simons', 'RS', ARRAY['DETLEF BVBA'], 18),
    ('Simone Rocha', 'SR', ARRAY['SR STUDIO LTD'], 19),
    ('Y/Project', 'YP', ARRAY['IN-CARNATION SARL', 'Y Project'], 20)
) AS t(name, code, aliases, sort_order)
ON CONFLICT (tenant_id, type, name) DO NOTHING;
