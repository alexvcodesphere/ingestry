/**
 * Product Normalizer Module
 * Transforms raw GPT Vision output into standardized product format.
 * Handles color normalization, SKU generation, price parsing, and size standardization.
 */

import type { RawExtractedProduct, NormalizedProduct, ProcessingContext } from '@/types';
import { normalizeColor } from '@/lib/services/color-normalizer';
import { generateSku } from '@/lib/services/sku-generator';

/**
 * Normalize a single raw product from GPT Vision output
 */
export async function normalizeProduct(
    raw: RawExtractedProduct,
    index: number,
    context: ProcessingContext
): Promise<NormalizedProduct> {
    // Parse and normalize color
    const colorNormalized = context.options?.normalize_colors !== false
        ? await normalizeColor(raw.color)
        : raw.color;

    // Parse quantity (default to 1)
    const quantity = parseQuantity(raw.quantity);

    // Parse price
    const { price, currency } = parsePrice(raw.price);

    // Normalize size
    const sizeNormalized = normalizeSize(raw.size);

    // Determine brand
    const brand = raw.brand || context.brand?.brand_name || context.supplier_name || 'Unknown';

    // Generate SKU if enabled and not already present
    let sku = raw.sku;
    if ((!sku || sku.trim() === '') && context.options?.auto_generate_sku !== false) {
        sku = await generateSku({
            brand,
            season: detectSeason(),
            category: '',
            gender: detectGender(raw.name),
            colour: colorNormalized || raw.color,
            productNumber: index + 1,
            size: sizeNormalized || raw.size,
        });
    }

    return {
        // Core identifiers
        sku: sku || `TEMP-${String(index + 1).padStart(5, '0')}`,
        ean: raw.ean || undefined,
        article_number: raw.articleNumber || undefined,
        style_code: raw.styleCode || undefined,
        designer_code: raw.designerCode || undefined,

        // Product info
        name: raw.name,
        brand,
        supplier: context.supplier_name || context.brand?.supplier_name,

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
        category: undefined,
        gender: detectGender(raw.name),
        season: detectSeason(),
    };
}

/**
 * Normalize multiple raw products
 */
export async function normalizeProducts(
    rawProducts: RawExtractedProduct[],
    context: ProcessingContext
): Promise<NormalizedProduct[]> {
    const normalized: NormalizedProduct[] = [];

    for (let i = 0; i < rawProducts.length; i++) {
        const product = await normalizeProduct(rawProducts[i], i, context);
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
