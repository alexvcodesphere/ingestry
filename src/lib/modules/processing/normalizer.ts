/**
 * Product Normalizer Module
 * Transforms raw GPT Vision output into standardized product format.
 * Handles normalization using lookup types, SKU generation, price parsing, and size standardization.
 */

import type { RawExtractedProduct, NormalizedProduct, ProcessingContext } from '@/types';
import type { ProcessingProfile, FieldConfig } from '@/lib/gpt/prompt-builder';
import { normalizeUsingLookup } from '@/lib/services/lookup-normalizer';
import { generateSku } from '@/lib/services/sku-generator';

/**
 * Normalize a single raw product from GPT Vision output
 */
export async function normalizeProduct(
    raw: RawExtractedProduct,
    index: number,
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<NormalizedProduct> {
    // Apply normalizations based on profile field configurations
    let colorNormalized = raw.color;
    const normalizedValues: Record<string, string> = {};
    // Cast raw to record for accessing custom fields
    const rawAsRecord = raw as unknown as Record<string, string>;

    if (profile?.fields) {
        for (const field of profile.fields) {
            if (field.normalize_with) {
                const rawValue = (raw as unknown as Record<string, unknown>)[field.key];
                if (typeof rawValue === 'string' && rawValue) {
                    const normalized = await normalizeUsingLookup(rawValue, field.normalize_with);
                    normalizedValues[field.key] = normalized;

                    // Special handling for color field
                    if (field.key === 'color') {
                        colorNormalized = normalized;
                    }
                }
            }
        }
    } else if (context.options?.normalize_colors !== false) {
        // Fallback: use legacy color normalization
        const { normalizeColor } = await import('@/lib/services/color-normalizer');
        colorNormalized = await normalizeColor(raw.color);
    }

    // Parse quantity (default to 1)
    const quantity = parseQuantity(raw.quantity);

    // Parse price
    const { price, currency } = parsePrice(raw.price);

    // Normalize size
    const sizeNormalized = normalizeSize(raw.size);

    // Determine brand
    const brand = raw.brand || context.brand_name || 'Unknown';

    // Generate SKU only if:
    // - Using a profile with generate_sku enabled, OR
    // - No profile and auto_generate_sku is enabled
    let sku = raw.sku;
    const shouldGenerateSku = profile
        ? profile.generate_sku === true
        : context.options?.auto_generate_sku !== false;

    if ((!sku || sku.trim() === '') && shouldGenerateSku) {
        sku = await generateSku({
            brand,
            season: detectSeason(),
            category: normalizedValues['category'] || '',
            gender: detectGender(raw.name),
            colour: colorNormalized || raw.color,
            productNumber: index + 1,
            size: sizeNormalized || raw.size,
            custom: { ...rawAsRecord, ...normalizedValues },
        }, profile?.sku_template);
    }

    // If we have a profile, only output the fields defined in it
    if (profile?.fields && profile.fields.length > 0) {
        console.log(`[Normalizer] Using profile fields: ${profile.fields.map(f => f.key).join(', ')}`);
        console.log(`[Normalizer] Generate SKU: ${profile.generate_sku}`);
        console.log(`[Normalizer] Raw data keys: ${Object.keys(rawAsRecord).join(', ')}`);

        const result: Record<string, unknown> = {};

        // Only add SKU if generate_sku is enabled
        if (profile.generate_sku && sku) {
            result.sku = sku;
        }

        for (const field of profile.fields) {
            const key = field.key;
            const rawValue = rawAsRecord[key];

            // Try to get the value from raw data, normalized values, or computed values
            if (key === 'color') {
                result.color = raw.color || rawValue || '';
                result.color_normalized = colorNormalized;
            } else if (key === 'price') {
                result.price = price;
                result.currency = currency;
            } else if (key === 'quantity') {
                result.quantity = quantity;
            } else if (key === 'size') {
                result.size = raw.size || rawValue || '';
                result.size_normalized = sizeNormalized;
            } else if (key === 'brand') {
                result.brand = brand;
            } else if (key === 'name') {
                result.name = raw.name || rawValue || '';
            } else {
                // Custom field: try normalized value first, then raw value
                result[key] = normalizedValues[key] || rawValue || '';
                console.log(`[Normalizer] Custom field ${key}: ${result[key]}`);
            }
        }

        console.log(`[Normalizer] Result keys: ${Object.keys(result).join(', ')}`);
        return result as unknown as NormalizedProduct;
    }

    // Fallback: Build full normalized product (no profile)
    const baseProduct = {
        // Core identifiers
        sku: sku || `TEMP-${String(index + 1).padStart(5, '0')}`,
        ean: raw.ean || undefined,
        article_number: raw.articleNumber || undefined,
        style_code: raw.styleCode || undefined,
        designer_code: raw.designerCode || undefined,

        // Product info
        name: raw.name,
        brand,
        supplier: context.brand_name,

        // Attributes
        color: raw.color,
        color_normalized: colorNormalized,
        size: raw.size,
        size_normalized: sizeNormalized,

        // Pricing
        price,
        currency,

        // Quantity
        quantity,

        // Placeholders for enrichment
        category: normalizedValues['category'] || undefined,
        gender: detectGender(raw.name),
        season: detectSeason(),
    };

    // Merge in any additional raw fields not in the standard structure
    const extraFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawAsRecord)) {
        if (!(key in baseProduct) && value !== undefined && value !== '') {
            extraFields[key] = value;
        }
    }

    return {
        ...baseProduct,
        ...extraFields,
    } as NormalizedProduct;
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

    for (let i = 0; i < rawProducts.length; i++) {
        const product = await normalizeProduct(rawProducts[i], i, context, profile);
        normalized.push(product);
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

/**
 * Normalize size format
 */
function normalizeSize(size: string): string {
    if (!size) return '';

    const upper = size.toUpperCase().trim();

    // Standard letter sizes
    const letterSizes = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL'];
    for (const s of letterSizes) {
        if (upper === s || upper.includes(s)) return s;
    }

    // Numeric sizes (preserve as-is)
    if (/^\d+$/.test(upper)) return upper;

    // Size ranges like "25/32"
    if (/^\d+\/\d+$/.test(upper)) return upper;

    return size.trim();
}

/**
 * Detect gender from product name
 */
function detectGender(name: string): string {
    const lower = name.toLowerCase();

    if (lower.includes('women') || lower.includes('damen') || lower.includes('female')) {
        return 'women';
    }
    if (lower.includes('men') && !lower.includes('women')) {
        return 'men';
    }
    if (lower.includes('herren')) {
        return 'men';
    }
    if (lower.includes('unisex') || lower.includes('kids') || lower.includes('kinder')) {
        return 'unisex';
    }

    return 'unisex';
}

/**
 * Detect current season based on date
 */
function detectSeason(): string {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear() % 100; // Last 2 digits

    // Spring/Summer: Feb-Jul, Autumn/Winter: Aug-Jan
    if (month >= 1 && month <= 6) {
        return `SS${year}`;
    } else {
        return `AW${year}`;
    }
}
