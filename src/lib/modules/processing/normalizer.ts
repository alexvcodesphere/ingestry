/**
 * Product Normalizer Module
 * Transforms raw GPT Vision output into normalized product format.
 * 
 * This module is fully dynamic - it only processes fields defined in the profile.
 * No hardcoded field assumptions.
 */

import type { RawExtractedProduct, NormalizedProduct, ProcessingContext } from '@/types';
import type { ProcessingProfile } from '@/lib/extraction';
import { normalizeUsingLookup } from '@/lib/services/lookup-normalizer';
import { evaluateTemplate, TemplateContext } from '@/lib/services/template-engine';

/**
 * Normalize a single raw product from GPT Vision output
 * Processing is entirely driven by the profile fields.
 */
export async function normalizeProduct(
    raw: RawExtractedProduct,
    index: number,
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<NormalizedProduct> {
    // Cast raw to record for dynamic field access
    const rawAsRecord = raw as unknown as Record<string, string>;
    const normalizedValues: Record<string, string> = {};
    const lookupTypeMapping: Record<string, string> = {};

    // Step 1: Apply normalizations for fields that have normalize_with configured
    // Also build the lookup type mapping for template engine
    if (profile?.fields) {
        for (const field of profile.fields) {
            if (field.normalize_with) {
                // Build mapping: field key -> lookup type
                lookupTypeMapping[field.key] = field.normalize_with;
                
                const rawValue = rawAsRecord[field.key];
                if (typeof rawValue === 'string' && rawValue) {
                    const normalized = await normalizeUsingLookup(rawValue, field.normalize_with);
                    normalizedValues[field.key] = normalized;
                }
            }
        }
    }

    // Step 2: Apply fallbacks BEFORE building template context
    // This ensures templates can use fallback values
    const valuesWithFallbacks: Record<string, string> = {
        ...rawAsRecord,
        ...normalizedValues,
    };
    if (profile?.fields) {
        for (const field of profile.fields) {
            const currentValue = valuesWithFallbacks[field.key];
            if (field.fallback && (!currentValue || currentValue === '')) {
                valuesWithFallbacks[field.key] = field.fallback;
                console.log(`[Normalizer] Applied fallback for ${field.key}: ${field.fallback}`);
            }
        }
    }

    // Step 3: Build template context with fallbacks and lookup mapping
    const templateContext: TemplateContext = {
        values: valuesWithFallbacks,
        sequence: index + 1,
        lookupTypeMapping,
    };

    // Step 4: Process templated fields
    const templatedValues: Record<string, string> = {};
    if (profile?.fields) {
        for (const field of profile.fields) {
            if (field.use_template && field.template) {
                try {
                    const templatedValue = await evaluateTemplate(field.template, templateContext);
                    templatedValues[field.key] = templatedValue;
                    console.log(`[Normalizer] Templated field ${field.key}: ${templatedValue}`);
                } catch (templateError) {
                    console.error(`[Normalizer] Failed to evaluate template for ${field.key}:`, templateError);
                    templatedValues[field.key] = '';
                }
            }
        }
    }

    // Step 5: Build result with only the fields defined in the profile
    if (profile?.fields && profile.fields.length > 0) {
        console.log(`[Normalizer] Using profile fields: ${profile.fields.map(f => f.key).join(', ')}`);

        const result: Record<string, unknown> = {};

        for (const field of profile.fields) {
            const key = field.key;
            let value: unknown = '';

            // Priority: templated value > value with fallbacks already applied
            if (field.use_template && templatedValues[key] !== undefined) {
                value = templatedValues[key];
            } else {
                // Use valuesWithFallbacks which already has normalized + fallback values
                const fallbackedValue = valuesWithFallbacks[key] || '';
                value = parseFieldValue(key, fallbackedValue);
            }

            result[key] = value;
        }

        // Preserve _needs_checking metadata if present in raw data
        if (rawAsRecord._needs_checking) {
            result._needs_checking = rawAsRecord._needs_checking;
        }

        console.log(`[Normalizer] Result keys: ${Object.keys(result).join(', ')}`);
        return result as unknown as NormalizedProduct;
    }

    // Fallback: No profile - just pass through raw data with basic processing
    console.log('[Normalizer] No profile - passing through raw data');
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawAsRecord)) {
        if (value !== undefined && value !== '') {
            result[key] = parseFieldValue(key, value);
        }
    }

    return result as unknown as NormalizedProduct;
}

/**
 * Parse a field value based on common field name patterns
 * This handles quantity/price parsing without hardcoding specific fields
 */
function parseFieldValue(key: string, value: string): unknown {
    if (!value) return value;

    const keyLower = key.toLowerCase();

    // Quantity-like fields should be numbers
    if (keyLower.includes('quantity') || keyLower.includes('qty') || keyLower.includes('amount')) {
        return parseQuantity(value);
    }

    // Price-like fields should be parsed
    if (keyLower.includes('price') || keyLower.includes('cost') || keyLower.includes('total')) {
        return parsePrice(value).price;
    }

    // Everything else stays as string
    return value;
}

/**
 * Normalize multiple raw products
 */
export async function normalizeProducts(
    rawProducts: RawExtractedProduct[],
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<NormalizedProduct[]> {
    const normalized: NormalizedProduct[] = [];

    // Prefetch all lookup types in ONE database query for performance
    if (profile?.fields) {
        const { prefetchLookups, clearLookupCache } = await import('@/lib/services/lookup-normalizer');
        const lookupTypes = profile.fields
            .filter(f => f.normalize_with)
            .map(f => f.normalize_with!);
        
        if (lookupTypes.length > 0) {
            await prefetchLookups(lookupTypes);
        }
        
        try {
            for (let i = 0; i < rawProducts.length; i++) {
                try {
                    console.log(`[Normalizer] Processing product ${i + 1}/${rawProducts.length}`);
                    const product = await normalizeProduct(rawProducts[i], i, context, profile);
                    normalized.push(product);
                } catch (error) {
                    console.error(`[Normalizer] Failed to normalize product ${i + 1}:`, error);
                    console.error(`[Normalizer] Raw product data:`, JSON.stringify(rawProducts[i], null, 2));
                    throw error;
                }
            }
        } finally {
            // Clear cache after processing to free memory
            clearLookupCache();
        }
        
        return normalized;
    }

    // No profile - process without prefetch
    for (let i = 0; i < rawProducts.length; i++) {
        try {
            console.log(`[Normalizer] Processing product ${i + 1}/${rawProducts.length}`);
            const product = await normalizeProduct(rawProducts[i], i, context, profile);
            normalized.push(product);
        } catch (error) {
            console.error(`[Normalizer] Failed to normalize product ${i + 1}:`, error);
            console.error(`[Normalizer] Raw product data:`, JSON.stringify(rawProducts[i], null, 2));
            throw error;
        }
    }

    return normalized;
}

/**
 * Parse quantity string to number
 */
function parseQuantity(quantityStr: string): number {
    if (!quantityStr) return 1;

    const cleaned = quantityStr.replace(/[^0-9]/g, '');
    const parsed = parseInt(cleaned, 10);

    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/**
 * Parse price string to number and currency
 */
function parsePrice(priceStr: string): { price: number; currency: string } {
    if (!priceStr) return { price: 0, currency: 'EUR' };

    // Detect currency
    let currency = 'EUR';
    if (priceStr.includes('$') || priceStr.toLowerCase().includes('usd')) {
        currency = 'USD';
    } else if (priceStr.includes('£') || priceStr.toLowerCase().includes('gbp')) {
        currency = 'GBP';
    }

    // Extract numeric value
    // Handle European format (1.234,56) and US format (1,234.56)
    let cleaned = priceStr.replace(/[€$£]/g, '').trim();

    // Determine decimal separator
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');

    if (lastComma > lastDot) {
        // European format: 1.234,56
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        // US format: 1,234.56
        cleaned = cleaned.replace(/,/g, '');
    }

    // Extract number
    const match = cleaned.match(/[\d.]+/);
    const price = match ? parseFloat(match[0]) : 0;

    return { price: isNaN(price) ? 0 : price, currency };
}
