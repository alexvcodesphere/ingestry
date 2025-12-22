-- Migration: Configuration Tables for Productization
-- Adds SKU templates, code lookups, and extraction profiles

------------------------------------------------------------
-- SKU Templates
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sku_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    template TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure only one default template
CREATE UNIQUE INDEX IF NOT EXISTS idx_sku_templates_default 
    ON sku_templates (is_default) WHERE is_default = true;

-- Insert default template matching current SKU format
INSERT INTO sku_templates (name, template, description, is_default)
VALUES (
    'Voo Standard',
    '{season}{brand:2}{gender}{category:2}{colour:2}{sequence:3}-{size}',
    'Standard SKU format: Season + Brand + Gender + Category + Colour + Sequence - Size. Example: 123NKW0101001-XS',
    true
);

------------------------------------------------------------
-- Code Lookups (brands, categories, colours, seasons, genders)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS code_lookups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    aliases TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(type, name)
);

CREATE INDEX IF NOT EXISTS idx_code_lookups_type ON code_lookups(type);
CREATE INDEX IF NOT EXISTS idx_code_lookups_type_code ON code_lookups(type, code);

-- Insert gender codes
INSERT INTO code_lookups (type, name, code, sort_order) VALUES
    ('gender', 'Women', 'W', 1),
    ('gender', 'Men', 'M', 2),
    ('gender', 'Unisex', 'U', 3)
ON CONFLICT (type, name) DO NOTHING;

-- Insert season type codes
INSERT INTO code_lookups (type, name, code, sort_order) VALUES
    ('season_type', 'Spring/Summer', '1', 1),
    ('season_type', 'Autumn/Winter', '2', 2),
    ('season_type', 'CarryOver', '300', 3),
    ('season_type', 'Archive', '400', 4)
ON CONFLICT (type, name) DO NOTHING;

-- Insert standard colour codes
INSERT INTO code_lookups (type, name, code, aliases, sort_order) VALUES
    ('colour', 'Black', '01', '{"schwarz","noir"}', 1),
    ('colour', 'Grey', '02', '{"gray","grau","gris"}', 2),
    ('colour', 'Yellow', '03', '{"gelb","jaune"}', 3),
    ('colour', 'Beige', '04', '{"cream","tan","sand"}', 4),
    ('colour', 'Green', '05', '{"olive","khaki","grün"}', 5),
    ('colour', 'Blue', '06', '{"blau","bleu"}', 6),
    ('colour', 'Navy', '07', '{"marine","dunkelblau"}', 7),
    ('colour', 'Purple', '08', '{"violet","lila"}', 8),
    ('colour', 'Pink', '09', '{"rose","rosa"}', 9),
    ('colour', 'White', '10', '{"off-white","ivory","weiß"}', 10),
    ('colour', 'Red', '11', '{"burgundy","maroon","rot"}', 11),
    ('colour', 'Orange', '12', '{"orange","coral"}', 12),
    ('colour', 'Brown', '13', '{"camel","chocolate","braun"}', 13),
    ('colour', 'Silver', '14', '{"silber"}', 14),
    ('colour', 'Gold', '15', '{"golden"}', 15),
    ('colour', 'Multi', '16', '{"multicolor","multicolour","bunt"}', 16)
ON CONFLICT (type, name) DO NOTHING;

-- Insert standard category codes
INSERT INTO code_lookups (type, name, code, sort_order) VALUES
    ('category', 'Outerwear', '01', 1),
    ('category', 'Knitwear', '02', 2),
    ('category', 'Sweatshirts and Hoodies', '03', 3),
    ('category', 'Tops', '04', 4),
    ('category', 'Shirts', '05', 5),
    ('category', 'Dresses', '06', 6),
    ('category', 'Skirts', '07', 7),
    ('category', 'Trousers', '08', 8),
    ('category', 'Shorts', '09', 9),
    ('category', 'Denim', '10', 10),
    ('category', 'Sportswear', '11', 11),
    ('category', 'Swimwear', '12', 12),
    ('category', 'Underwear', '13', 13),
    ('category', 'Sneakers', '14', 14),
    ('category', 'Shoes', '15', 15),
    ('category', 'Boots', '16', 16),
    ('category', 'Heels', '17', 17),
    ('category', 'Sandals', '18', 18),
    ('category', 'Bags', '19', 19),
    ('category', 'Hats', '20', 20),
    ('category', 'Scarves and Gloves', '21', 21),
    ('category', 'Socks', '22', 22),
    ('category', 'Belts', '23', 23),
    ('category', 'Wallets', '24', 24),
    ('category', 'Eyewear', '25', 25),
    ('category', 'Jewellery', '26', 26),
    ('category', 'Fragrances', '27', 27),
    ('category', 'Skincare', '28', 28),
    ('category', 'Candles and Home Scents', '29', 29),
    ('category', 'Glassware and Vases', '30', 30),
    ('category', 'Ceramics', '31', 31),
    ('category', 'Textiles', '32', 32),
    ('category', 'Stationery', '33', 33),
    ('category', 'Wellness', '34', 34),
    ('category', 'Pets', '35', 35),
    ('category', 'Lifestyle', '36', 36),
    ('category', 'Gift Card', '37', 37),
    ('category', 'Magazines', '38', 38),
    ('category', 'Books', '39', 39)
ON CONFLICT (type, name) DO NOTHING;

------------------------------------------------------------
-- Extraction Profiles
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS extraction_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    fields JSONB NOT NULL DEFAULT '[]',
    prompt_additions TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure only one default profile
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_profiles_default 
    ON extraction_profiles (is_default) WHERE is_default = true;

-- Insert default extraction profile
INSERT INTO extraction_profiles (name, description, fields, is_default)
VALUES (
    'Fashion Order',
    'Standard profile for fashion order confirmations',
    '[
        {"key": "name", "label": "Product Name", "type": "text", "required": true, "instructions": "Full product name as shown"},
        {"key": "brand", "label": "Brand", "type": "text", "required": false, "instructions": "Brand or designer name"},
        {"key": "sku", "label": "SKU", "type": "text", "required": false, "instructions": "Existing SKU or article number if present"},
        {"key": "color", "label": "Colour", "type": "text", "required": true, "instructions": "Colour name or code"},
        {"key": "size", "label": "Size", "type": "text", "required": true, "instructions": "Size (XS, S, M, L, XL, numeric, etc.)"},
        {"key": "price", "label": "Price", "type": "currency", "required": true, "instructions": "Unit price with currency symbol"},
        {"key": "quantity", "label": "Quantity", "type": "number", "required": true, "instructions": "Number of units ordered"},
        {"key": "ean", "label": "EAN/Barcode", "type": "text", "required": false, "instructions": "13-digit EAN barcode if present"},
        {"key": "articleNumber", "label": "Article Number", "type": "text", "required": false, "instructions": "Supplier article or style number"},
        {"key": "styleCode", "label": "Style Code", "type": "text", "required": false, "instructions": "Style or model code"}
    ]'::jsonb,
    true
);

------------------------------------------------------------
-- Update triggers for updated_at
------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_sku_templates_updated_at ON sku_templates;
CREATE TRIGGER update_sku_templates_updated_at
    BEFORE UPDATE ON sku_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_extraction_profiles_updated_at ON extraction_profiles;
CREATE TRIGGER update_extraction_profiles_updated_at
    BEFORE UPDATE ON extraction_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
