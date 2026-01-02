/**
 * Product Catalog Matching Module
 * Transforms raw GPT Vision output into normalized product format.
 * 
 * This module is fully dynamic - it only processes fields defined in the profile.
 * AI semantic matching resolves synonyms during extraction; this module retrieves
 * metadata (codes, extra_data) for the template engine.
 */

import type { RawExtractedProduct, NormalizedProduct, ProcessingContext } from '@/types';
import type { ProcessingProfile } from '@/lib/extraction';
import { matchAgainstCatalog } from '@/lib/services/catalog-reconciler';
import { evaluateTemplate, TemplateContext } from '@/lib/services/template-engine';

/**
 * Process catalog matching for a single raw product from GPT Vision output
 * Processing is entirely driven by the profile fields.
 */
export async function processCatalogMatching(
    raw: RawExtractedProduct,
    index: number,
    context: ProcessingContext,
    profile?: ProcessingProfile | null,
    // Optional caches to avoid N+1 DB calls in template engine
    codeLookups?: Map<string, Map<string, string>>,
    extraDataLookups?: Map<string, Map<string, Record<string, unknown>>>
): Promise<NormalizedProduct> {
    // Cast raw to record for dynamic field access
    const rawAsRecord = raw as unknown as Record<string, string>;
    const matchedValues: Record<string, string> = {};
    const catalogKeyMapping: Record<string, string> = {};

    // Step 1: Apply catalog matching for fields that have catalog_key configured
    // Also build the catalog key mapping for template engine
    if (profile?.fields) {
        for (const field of profile.fields) {
            if (field.catalog_key) {
                // Build mapping: field key -> catalog key
                catalogKeyMapping[field.key] = field.catalog_key;
                
                const rawValue = rawAsRecord[field.key];
                if (typeof rawValue === 'string' && rawValue) {
                    const matched = await matchAgainstCatalog(rawValue, field.catalog_key);
                    matchedValues[field.key] = matched;
                }
            }
        }
    }

    // Step 2: Apply fallbacks BEFORE building template context
    // This ensures templates can use fallback values
    const valuesWithFallbacks: Record<string, string> = {
        ...rawAsRecord,
        ...matchedValues,
    };
    if (profile?.fields) {
        for (const field of profile.fields) {
            const currentValue = valuesWithFallbacks[field.key];
            if (field.fallback && (!currentValue || currentValue === '')) {
                valuesWithFallbacks[field.key] = field.fallback;
            }
        }
    }

    // Step 3: Build template context with fallbacks and catalog key mapping
    const templateContext: TemplateContext = {
        values: valuesWithFallbacks,
        sequence: index + 1,
        lookupTypeMapping: catalogKeyMapping,
    };

    // Step 4: Process templated fields
    const templatedValues: Record<string, string> = {};
    if (profile?.fields) {
        for (const field of profile.fields) {
            if (field.use_template && field.template) {
                try {
                    // Pass caches to avoid DB calls
                    const templatedValue = await evaluateTemplate(
                        field.template, 
                        templateContext,
                        codeLookups,
                        extraDataLookups
                    );
                    templatedValues[field.key] = templatedValue;
                } catch (templateError) {
                    console.error(`[CatalogMatching] Failed to evaluate template for ${field.key}:`, templateError);
                    templatedValues[field.key] = '';
                }
            }
        }
    }

    if (profile?.fields && profile.fields.length > 0) {
        const result: Record<string, unknown> = {};

        for (const field of profile.fields) {
            const key = field.key;
            let value: unknown = '';

            // Priority: templated value > value with fallbacks already applied
            if (field.use_template && templatedValues[key] !== undefined) {
                value = templatedValues[key];
            } else {
                // Use valuesWithFallbacks which already has matched + fallback values
                const fallbackedValue = valuesWithFallbacks[key] || '';
                value = parseFieldValue(key, fallbackedValue);
            }

            result[key] = value;
        }

        // Preserve _needs_checking metadata if present in raw data
        if (rawAsRecord._needs_checking) {
            result._needs_checking = rawAsRecord._needs_checking;
        }

        return result as unknown as NormalizedProduct;
    }

    // Fallback: No profile - just pass through raw data with basic processing
    console.log('[CatalogMatching] No profile - passing through raw data');
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rawAsRecord)) {
        if (value !== undefined && value !== '') {
            result[key] = parseFieldValue(key, value);
        }
    }

    return result as unknown as NormalizedProduct;
}

// ... existing code ...

/**
 * Process catalog matching for multiple raw products
 */
export async function processCatalogMatchingBatch(
    rawProducts: RawExtractedProduct[],
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<NormalizedProduct[]> {
    const processed: NormalizedProduct[] = [];

    // Prefetch all catalog entries in ONE database query for performance
    if (profile?.fields) {
        const { prefetchCatalog, clearCatalogCache, getCatalogCache } = await import('@/lib/services/catalog-reconciler');
        const catalogKeys = profile.fields
            .filter(f => f.catalog_key)
            .map(f => f.catalog_key!);
        
        let codeLookups: Map<string, Map<string, string>> | undefined;
        let extraDataLookups: Map<string, Map<string, Record<string, unknown>>> | undefined;

        if (catalogKeys.length > 0) {
            await prefetchCatalog(catalogKeys);
            
            // Build optimization maps from cache
            const cache = getCatalogCache();
            codeLookups = new Map();
            extraDataLookups = new Map();
            
            for (const [type, entries] of cache.entries()) {
                const codeMap = new Map<string, string>();
                const extraMap = new Map<string, Record<string, unknown>>();
                
                for (const entry of entries) {
                    const normalizedName = entry.name.toLowerCase().trim();
                    codeMap.set(normalizedName, entry.code);
                    if (entry.extra_data) extraMap.set(normalizedName, entry.extra_data);
                    
                    if (entry.aliases) {
                        for (const alias of entry.aliases) {
                            const normalizedAlias = alias.toLowerCase().trim();
                            codeMap.set(normalizedAlias, entry.code);
                            if (entry.extra_data) extraMap.set(normalizedAlias, entry.extra_data);
                        }
                    }
                }
                codeLookups.set(type, codeMap);
                extraDataLookups.set(type, extraMap);
            }
        }
        
        try {
            for (let i = 0; i < rawProducts.length; i++) {
                try {
                    // Pass the optimized maps to processCatalogMatching
                    const product = await processCatalogMatching(
                        rawProducts[i], 
                        i, 
                        context, 
                        profile,
                        codeLookups,
                        extraDataLookups
                    );
                    processed.push(product);
                } catch (error) {
                    console.error(`[CatalogMatching] Failed to process product ${i + 1}:`, error);
                    console.error(`[CatalogMatching] Raw product data:`, JSON.stringify(rawProducts[i], null, 2));
                    throw error;
                }
            }
        } finally {
            // Clear cache after processing to free memory
            clearCatalogCache();
        }
        
        return processed;
    }

    // No profile - process without prefetch
    for (let i = 0; i < rawProducts.length; i++) {
        try {
            const product = await processCatalogMatching(rawProducts[i], i, context, profile);
            processed.push(product);
        } catch (error) {
            console.error(`[CatalogMatching] Failed to process product ${i + 1}:`, error);
            console.error(`[CatalogMatching] Raw product data:`, JSON.stringify(rawProducts[i], null, 2));
            throw error;
        }
    }

    return processed;
}

// Keep legacy export names for backward compatibility
export { processCatalogMatching as normalizeProduct };
export { processCatalogMatchingBatch as normalizeProducts };

/**
 * Parse a field value based on common field name patterns
 * This handles quantity/price parsing without hardcoding specific fields
 */
export function parseFieldValue(key: string, value: string): unknown {
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
