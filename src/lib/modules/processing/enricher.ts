/**
 * Product Enricher Module
 * Enriches normalized products with category assignments based on template rules.
 * Applies business logic for gender detection, category matching, and default values.
 */

import type { NormalizedProduct, MappingTemplate, CategoryRule } from '@/types';

/**
 * Enrich a single product with category and additional metadata
 */
export function enrichProduct(
    product: NormalizedProduct,
    template?: MappingTemplate
): NormalizedProduct {
    const enriched = { ...product };

    // Apply category rules from template
    if (template?.category_rules) {
        const { category, gender } = matchCategory(product, template.category_rules);
        if (category) enriched.category = category;
        if (gender) enriched.gender = gender;
    }

    // Fallback category detection if no template match
    if (!enriched['category']) {
        enriched['category'] = detectCategory(String(product['name'] || ''));
    }

    // Refine gender from category if still unisex
    if (enriched['gender'] === 'unisex' && enriched['category']) {
        enriched['gender'] = detectGenderFromCategory(String(enriched['category'])) || enriched['gender'];
    }

    return enriched;
}

/**
 * Enrich multiple products
 */
export function enrichProducts(
    products: NormalizedProduct[],
    template?: MappingTemplate
): NormalizedProduct[] {
    return products.map(p => enrichProduct(p, template));
}

/**
 * Match product against category rules
 */
function matchCategory(
    product: NormalizedProduct,
    rules: CategoryRule[]
): { category?: string; gender?: string } {
    const searchText = `${product['name'] || ''} ${product['color'] || ''} ${product['brand'] || ''}`.toLowerCase();

    for (const rule of rules) {
        const matches = rule.keywords.some(keyword =>
            searchText.includes(keyword.toLowerCase())
        );

        if (matches) {
            return {
                category: rule.category,
                gender: rule.gender,
            };
        }
    }

    return {};
}

/**
 * Detect category from product name using keyword matching
 */
function detectCategory(name: string): string {
    const lower = name.toLowerCase();

    // Footwear
    if (matchesAny(lower, ['shoe', 'sneaker', 'boot', 'sandal', 'loafer', 'heel', 'pump', 'slipper', 'trainer'])) {
        return 'Footwear';
    }

    // Outerwear
    if (matchesAny(lower, ['jacket', 'coat', 'blazer', 'parka', 'vest', 'cardigan', 'hoodie', 'anorak'])) {
        return 'Outerwear';
    }

    // Tops
    if (matchesAny(lower, ['shirt', 'blouse', 't-shirt', 'tee', 'top', 'sweater', 'pullover', 'polo', 'tank'])) {
        return 'Tops';
    }

    // Bottoms
    if (matchesAny(lower, ['pant', 'trouser', 'jean', 'short', 'skirt', 'chino', 'legging'])) {
        return 'Bottoms';
    }

    // Dresses
    if (matchesAny(lower, ['dress', 'gown', 'jumpsuit', 'romper'])) {
        return 'Dresses';
    }

    // Accessories
    if (matchesAny(lower, ['bag', 'belt', 'hat', 'scarf', 'wallet', 'watch', 'sunglasses', 'glove', 'cap'])) {
        return 'Accessories';
    }

    // Bags specifically
    if (matchesAny(lower, ['handbag', 'tote', 'clutch', 'backpack', 'purse', 'satchel'])) {
        return 'Bags';
    }

    // Jewelry
    if (matchesAny(lower, ['ring', 'necklace', 'bracelet', 'earring', 'jewelry', 'jewellery', 'pendant'])) {
        return 'Jewelry';
    }

    // Knitwear
    if (matchesAny(lower, ['knit', 'wool', 'cashmere', 'merino'])) {
        return 'Knitwear';
    }

    // Swimwear
    if (matchesAny(lower, ['swim', 'bikini', 'trunk', 'beach'])) {
        return 'Swimwear';
    }

    return 'Other';
}

/**
 * Check if text matches any of the keywords
 */
function matchesAny(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
}

/**
 * Detect gender from category name
 */
function detectGenderFromCategory(category: string): string | undefined {
    const lower = category.toLowerCase();

    if (lower.includes('women') || lower.includes('female') || lower.includes('ladies')) {
        return 'women';
    }
    if (lower.includes('men') && !lower.includes('women')) {
        return 'men';
    }

    return undefined;
}

/**
 * Validate that required fields are present
 * Validation is now dynamic - only checks fields that exist in the product
 */
export function validateProduct(product: NormalizedProduct): string[] {
    const errors: string[] = [];
    const productRecord = product as unknown as Record<string, unknown>;

    // Only validate SKU if it exists as a field (i.e., profile has generate_sku enabled)
    if ('sku' in productRecord && !product['sku']) {
        errors.push('SKU is required');
    }

    // Only validate name if it exists as a field
    if ('name' in productRecord && !product['name']) {
        errors.push('Name is required');
    }

    // Only validate price if it exists as a field
    if ('price' in productRecord && Number(product['price'] || 0) <= 0) {
        errors.push('Price must be greater than 0');
    }

    // Only validate quantity if it exists as a field
    if ('quantity' in productRecord && Number(product['quantity'] || 0) <= 0) {
        errors.push('Quantity must be greater than 0');
    }

    return errors;
}

/**
 * Get validation statistics for a batch of products
 */
export function getValidationStats(products: NormalizedProduct[]): {
    total: number;
    valid: number;
    invalid: number;
    issues: Array<{ sku: string; errors: string[] }>;
} {
    const issues: Array<{ sku: string; errors: string[] }> = [];
    let valid = 0;
    let invalid = 0;

    for (const product of products) {
        const errors = validateProduct(product);
        if (errors.length > 0) {
            invalid++;
            issues.push({ sku: String(product['sku'] || ''), errors });
        } else {
            valid++;
        }
    }

    return {
        total: products.length,
        valid,
        invalid,
        issues,
    };
}
