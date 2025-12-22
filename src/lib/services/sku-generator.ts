/**
 * SKU Generator Service
 * Uses the template engine to generate SKUs based on configurable templates.
 * Provides backwards compatibility with existing code while using new flexible system.
 */

import type { NormalizedProduct, ProcessingContext } from '@/types';
import {
    generateSkuFromTemplate,
    loadCodeLookups,
    type TemplateContext
} from './template-engine';

export interface SkuComponents {
    brand: string;
    season: string;
    category: string;
    gender: string;
    color: string;
    productNumber: number;
    size?: string;
    custom?: Record<string, string>; // Custom normalized values
}

export interface SkuMappings {
    brandCode: string;
    categoryCode: string;
    colorCode: string;
}

// Cache for code lookups
let lookupsCache: Map<string, Map<string, string>> | null = null;
let lookupsCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Get cached code lookups
 */
async function getCachedLookups(): Promise<Map<string, Map<string, string>>> {
    const now = Date.now();
    if (!lookupsCache || now - lookupsCacheTime > CACHE_TTL) {
        lookupsCache = await loadCodeLookups();
        lookupsCacheTime = now;
    }
    return lookupsCache;
}

/**
 * Get brand code from code_lookups table
 */
export async function getBrandCode(brandName: string): Promise<string> {
    const lookups = await getCachedLookups();
    const brandLookup = lookups.get('brand');

    if (!brandLookup || !brandName) return 'XX';

    const normalized = brandName.toLowerCase().trim();

    // Try exact match
    if (brandLookup.has(normalized)) {
        return brandLookup.get(normalized)!;
    }

    // Try partial match
    for (const [key, code] of brandLookup) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return code;
        }
    }

    return 'XX';
}

/**
 * Get category code from code_lookups table
 */
export async function getCategoryCode(categoryName: string): Promise<string> {
    const lookups = await getCachedLookups();
    const categoryLookup = lookups.get('category');

    if (!categoryLookup || !categoryName) return '00';

    const normalized = categoryName.toLowerCase().trim();

    if (categoryLookup.has(normalized)) {
        return categoryLookup.get(normalized)!;
    }

    for (const [key, code] of categoryLookup) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return code;
        }
    }

    return '00';
}

/**
 * Get color code from code_lookups table
 */
export async function getColorCode(colorName: string): Promise<string> {
    const lookups = await getCachedLookups();
    const colorLookup = lookups.get('color');

    if (!colorLookup || !colorName) return '00';

    const normalized = colorName.toLowerCase().trim();

    if (colorLookup.has(normalized)) {
        return colorLookup.get(normalized)!;
    }

    for (const [key, code] of colorLookup) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return code;
        }
    }

    return '00';
}

/**
 * Generate a SKU using the template engine
 * This is the main entry point for SKU generation
 */
export async function generateSku(
    components: SkuComponents,
    templateOverride?: string // Optional template from processing profile
): Promise<string> {
    const context: TemplateContext = {
        brand: components.brand,
        category: components.category,
        color: components.color,
        gender: components.gender,
        season: components.season,
        size: components.size,
        sequence: components.productNumber,
        custom: components.custom,
    };

    return generateSkuFromTemplate(context, templateOverride);
}

/**
 * Generate SKU for a normalized product
 */
export async function generateSkuForProduct(
    product: Partial<NormalizedProduct>,
    sequence: number,
    _context?: ProcessingContext
): Promise<string> {
    const templateContext: TemplateContext = {
        brand: product['brand'] as string | undefined,
        category: product['category'] as string | undefined,
        color: (product['color_normalized'] || product['color']) as string | undefined,
        gender: product['gender'] as string | undefined,
        season: product['season'] as string | undefined,
        size: (product['size_normalized'] || product['size']) as string | undefined,
        ean: product['ean'] as string | undefined,
        sequence,
    };

    return generateSkuFromTemplate(templateContext);
}

/**
 * Generate SKUs for multiple products
 */
export async function generateSkusForProducts(
    products: Array<Partial<NormalizedProduct>>,
    startNumber: number = 1
): Promise<string[]> {
    const skus: string[] = [];

    for (let i = 0; i < products.length; i++) {
        const sku = await generateSkuForProduct(products[i], startNumber + i);
        skus.push(sku);
    }

    return skus;
}
