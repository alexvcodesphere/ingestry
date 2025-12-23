/**
 * Product Enricher Module
 * Enriches normalized products with category assignments based on template rules.
 * 
 * All category and gender detection is driven by template rules only.
 * No hardcoded fallbacks - if no rules match, values remain empty.
 */

import type { NormalizedProduct, MappingTemplate, CategoryRule } from '@/types';

/**
 * Enrich a single product with category and additional metadata
 * Uses ONLY template rules - no hardcoded detection
 */
export function enrichProduct(
    product: NormalizedProduct,
    template?: MappingTemplate
): NormalizedProduct {
    const enriched = { ...product };

    // Apply category rules from template (if provided)
    if (template?.category_rules) {
        const { category, gender } = matchCategory(product, template.category_rules);
        if (category) enriched.category = category;
        if (gender) enriched.gender = gender;
    }

    // No fallback detection - values remain as extracted
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
