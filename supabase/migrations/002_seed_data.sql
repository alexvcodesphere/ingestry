-- Seed data for suppliers (sample from core_shop.py)
-- Full migration would include all ~500 mappings

insert into suppliers (brand_name, supplier_name, brand_code) values
  ('Acne Studios', 'ACNE STUDIOS AB', 'AC'),
  ('032c', '032C System GmbH', 'ZC'),
  ('A Kind of Guise', 'AKOG SERVICE GMBH', 'AK'),
  ('A. Roege Hove', 'ROEGE & CO ApS', 'RH'),
  ('Carhartt WIP', 'Work in Progress Textilhandels GmbH', 'CH'),
  ('Carne Bollente', 'CARNE CORP SAS', 'CB'),
  ('Chopova Lowena', 'CHOPOVA LOWENA LTD', 'CL'),
  ('Christina Seewald', 'Christina Seewald', 'CS'),
  ('Diesel', 'Diesel Spa', 'DI'),
  ('Dries Van Noten', 'VAN NOTEN ANDRIES N.V.', 'DV'),
  ('Brain Dead', 'Gimme5 B.V.', 'BD'),
  ('Jacquemus', 'JACQUEMUS SAS', 'JQ'),
  ('Jil Sander', 'Jil Sander S.p.A.', 'JS'),
  ('Lemaire', 'JINGHI SAS', 'LE'),
  ('Maison Margiela', 'MARGIELA S.A.S.', 'MM'),
  ('Our Legacy', 'Selftitled AB', 'OL'),
  ('Prada', 'Prada SpA', 'PR'),
  ('Raf Simons', 'DETLEF BVBA', 'RS'),
  ('Simone Rocha', 'SR STUDIO LTD', 'SR'),
  ('Y/Project', 'IN-CARNATION SARL', 'YP')
on conflict (brand_name) do nothing;

-- Seed data for categories (from core_shop.py article_tree_cat_name)
insert into categories (code, name, article_tree) values
  ('01', 'Outerwear', array['clothing', 'clothing|outerwear']),
  ('02', 'Knitwear', array['clothing', 'clothing|knitwear']),
  ('03', 'Sweatshirts and Hoodies', array['clothing', 'clothing|sweatshirts and hoodies']),
  ('04', 'Tops', array['clothing', 'clothing|tops']),
  ('05', 'Shirts', array['clothing', 'clothing|shirt']),
  ('06', 'Dresses', array['clothing', 'clothing|dresses']),
  ('07', 'Skirts', array['clothing', 'clothing|skirts']),
  ('08', 'Trousers', array['clothing', 'clothing|trousers']),
  ('09', 'Shorts', array['clothing', 'clothing|shorts']),
  ('10', 'Denim', array['clothing', 'clothing|denim']),
  ('11', 'Sportswear', array['clothing', 'clothing|sportswear']),
  ('12', 'Swimwear', array['clothing', 'clothing|swimwear']),
  ('13', 'Underwear', array['clothing', 'clothing|underwear']),
  ('14', 'Sneakers', array['footwear', 'footwear|sneakers']),
  ('15', 'Shoes', array['footwear', 'footwear|shoes']),
  ('16', 'Boots', array['footwear', 'footwear|boots']),
  ('17', 'Heels', array['footwear', 'footwear|heels']),
  ('18', 'Sandals', array['footwear', 'footwear|sandals']),
  ('19', 'Bags', array['accessories', 'accessories|bags']),
  ('20', 'Hats', array['accessories', 'accessories|hats']),
  ('21', 'Scarves and Gloves', array['accessories', 'accessories|scarves and gloves']),
  ('22', 'Socks', array['accessories', 'accessories|socks']),
  ('23', 'Belts', array['accessories', 'accessories|belts']),
  ('24', 'Wallets', array['accessories', 'accessories|wallets']),
  ('25', 'Eyewear', array['accessories', 'accessories|eyewear']),
  ('26', 'Jewellery', array['accessories', 'accessories|jewellery'])
on conflict (code) do nothing;

-- Seed data for colors with aliases
insert into colors (canonical_name, code, aliases) values
  ('White', '01', array['Ivory', 'Cream', 'Off-White', 'Snow', 'Pearl']),
  ('Black', '02', array['Noir', 'Jet', 'Onyx', 'Coal']),
  ('Grey', '03', array['Gray', 'Charcoal', 'Slate', 'Silver Grey', 'Heather Grey']),
  ('Beige', '04', array['Tan', 'Sand', 'Camel', 'Nude', 'Ecru', 'Khaki']),
  ('Blue', '05', array['Azure', 'Cobalt', 'Sky Blue', 'Light Blue', 'Royal Blue']),
  ('Green', '06', array['Olive', 'Sage', 'Forest', 'Emerald', 'Mint', 'Khaki Green']),
  ('Navy', '07', array['Midnight Blue', 'Dark Blue', 'Marine', 'Navy Blue', 'Deep Blue']),
  ('Purple', '08', array['Violet', 'Lavender', 'Plum', 'Mauve', 'Lilac']),
  ('Pink', '09', array['Rose', 'Blush', 'Fuchsia', 'Dusty Pink', 'Hot Pink']),
  ('Red', '11', array['Burgundy', 'Wine', 'Crimson', 'Scarlet', 'Cherry', 'Maroon']),
  ('Orange', '12', array['Coral', 'Peach', 'Rust', 'Tangerine', 'Amber']),
  ('Brown', '13', array['Chocolate', 'Coffee', 'Espresso', 'Mahogany', 'Chestnut', 'Taupe']),
  ('Silver', '14', array['Metallic Silver', 'Gunmetal']),
  ('Gold', '15', array['Metallic Gold', 'Brass', 'Bronze']),
  ('Multi', '16', array['Multicolor', 'Mixed', 'Pattern', 'Print', 'Colorful']),
  ('Yellow', '10', array['Mustard', 'Lemon', 'Canary', 'Gold Yellow'])
on conflict (canonical_name) do nothing;
