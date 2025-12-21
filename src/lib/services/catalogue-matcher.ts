/**
 * Catalogue Matcher Service
 * Matches extracted PDF products against catalogue entries using multiple strategies:
 * 1. EAN match (100% confidence)
 * 2. Article number match (95% confidence)
 * 3. Style + Color + Size (80% confidence)
 * 4. Fuzzy name match (60% confidence)
 */

import type { CatalogueEntry } from "./catalogue-parser";

// Extracted product from GPT
export interface ExtractedProduct {
    name: string;
    color: string;
    size: string;
    price: string;
    quantity: string;
    ean: string;
    sku: string;
    articleNumber: string;
    styleCode: string;
    designerCode: string;
    brand: string;
}

export interface MatchResult {
    product: ExtractedProduct;
    match: CatalogueEntry | null;
    confidence: number; // 0-100
    matchType: "ean" | "article" | "style_color_size" | "fuzzy" | "none";
    enrichedData?: {
        composition: string;
        countryOfOrigin: string;
        category: string;
        gender: string;
        retailPrice: number;
        wholesalePrice: number;
    };
}

/**
 * Match a list of extracted products against catalogue entries
 */
export function matchProducts(
    products: ExtractedProduct[],
    catalogue: CatalogueEntry[]
): MatchResult[] {
    // Build lookup indices for fast matching
    const eanIndex = new Map<string, CatalogueEntry>();
    const articleIndex = new Map<string, CatalogueEntry>();
    const styleColorSizeIndex = new Map<string, CatalogueEntry>();

    for (const entry of catalogue) {
        if (entry.ean) {
            eanIndex.set(normalizeString(entry.ean), entry);
        }
        if (entry.articleNumber) {
            articleIndex.set(normalizeString(entry.articleNumber), entry);
        }
        // Create compound key for style+color+size
        if (entry.styleCode && entry.colorCode && entry.sizeCode) {
            const key = `${entry.styleCode}|${entry.colorCode}|${entry.sizeCode}`.toLowerCase();
            styleColorSizeIndex.set(key, entry);
        }
    }

    return products.map((product) => matchSingleProduct(
        product,
        eanIndex,
        articleIndex,
        styleColorSizeIndex,
        catalogue
    ));
}

/**
 * Match a single product against catalogue indices
 */
function matchSingleProduct(
    product: ExtractedProduct,
    eanIndex: Map<string, CatalogueEntry>,
    articleIndex: Map<string, CatalogueEntry>,
    styleColorSizeIndex: Map<string, CatalogueEntry>,
    catalogue: CatalogueEntry[]
): MatchResult {
    // Strategy 1: EAN match (100% confidence)
    if (product.ean) {
        const match = eanIndex.get(normalizeString(product.ean));
        if (match) {
            return createMatchResult(product, match, 100, "ean");
        }
    }

    // Strategy 2: Article number match (95% confidence)
    if (product.articleNumber) {
        const match = articleIndex.get(normalizeString(product.articleNumber));
        if (match) {
            return createMatchResult(product, match, 95, "article");
        }
    }

    // Strategy 3: Style + Color + Size (80% confidence)
    if (product.styleCode) {
        // Try exact match first
        const colorCode = extractColorCode(product.color);
        const sizeCode = extractSizeCode(product.size);

        const key = `${product.styleCode}|${colorCode}|${sizeCode}`.toLowerCase();
        const match = styleColorSizeIndex.get(key);
        if (match) {
            return createMatchResult(product, match, 80, "style_color_size");
        }

        // Try partial style match with fuzzy color/size
        for (const entry of catalogue) {
            if (normalizeString(entry.styleCode) === normalizeString(product.styleCode)) {
                const colorMatch = fuzzyColorMatch(product.color, entry.color) > 0.7;
                const sizeMatch = fuzzySizeMatch(product.size, entry.size) > 0.8;

                if (colorMatch && sizeMatch) {
                    return createMatchResult(product, entry, 75, "style_color_size");
                }
            }
        }
    }

    // Strategy 4: Fuzzy name match (60% confidence)
    const fuzzyMatch = findBestFuzzyMatch(product, catalogue);
    if (fuzzyMatch) {
        return createMatchResult(product, fuzzyMatch.entry, fuzzyMatch.confidence, "fuzzy");
    }

    // No match found
    return {
        product,
        match: null,
        confidence: 0,
        matchType: "none",
    };
}

/**
 * Create a match result with enriched data
 */
function createMatchResult(
    product: ExtractedProduct,
    match: CatalogueEntry,
    confidence: number,
    matchType: MatchResult["matchType"]
): MatchResult {
    return {
        product,
        match,
        confidence,
        matchType,
        enrichedData: {
            composition: match.composition,
            countryOfOrigin: match.countryOfOrigin,
            category: match.category,
            gender: match.gender,
            retailPrice: match.retailPrice,
            wholesalePrice: match.wholesalePrice,
        },
    };
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
    return str.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
}

/**
 * Extract color code from color name
 */
function extractColorCode(color: string): string {
    // Common color code patterns
    const codeMatch = color.match(/\(([A-Z0-9]+)\)/i);
    if (codeMatch) return codeMatch[1];

    // Return first 3 uppercase chars as fallback
    return color.replace(/[^A-Z0-9]/gi, "").slice(0, 3).toUpperCase();
}

/**
 * Extract size code from size string
 */
function extractSizeCode(size: string): string {
    // Common size patterns: S/M/L/XL, 36-52, 25/32
    const normalized = size.toUpperCase().replace(/\s/g, "");

    // Map letter sizes to codes
    const sizeMap: Record<string, string> = {
        "XXS": "101", "XS": "102", "S": "103", "M": "104", "L": "105", "XL": "106", "XXL": "107",
    };

    if (sizeMap[normalized]) return sizeMap[normalized];
    return normalized;
}

/**
 * Fuzzy match for color names
 */
function fuzzyColorMatch(color1: string, color2: string): number {
    const c1 = color1.toLowerCase().replace(/[^a-z]/g, "");
    const c2 = color2.toLowerCase().replace(/[^a-z]/g, "");

    if (c1 === c2) return 1;
    if (c1.includes(c2) || c2.includes(c1)) return 0.9;

    // Color synonym matching
    const synonyms: Record<string, string[]> = {
        black: ["noir", "nero", "schwarz"],
        white: ["blanc", "bianco", "weiss"],
        blue: ["blau", "blu", "navy"],
        grey: ["gray", "grau", "grigio"],
        brown: ["braun", "marrone"],
    };

    for (const [base, alts] of Object.entries(synonyms)) {
        const group = [base, ...alts];
        if (group.some(s => c1.includes(s)) && group.some(s => c2.includes(s))) {
            return 0.85;
        }
    }

    return levenshteinSimilarity(c1, c2);
}

/**
 * Fuzzy match for size values
 */
function fuzzySizeMatch(size1: string, size2: string): number {
    const s1 = normalizeString(size1);
    const s2 = normalizeString(size2);

    if (s1 === s2) return 1;

    // Handle size ranges (e.g., "25/32" vs "25")
    if (s1.includes("/") || s2.includes("/")) {
        const parts1 = s1.split("/");
        const parts2 = s2.split("/");
        if (parts1[0] === parts2[0]) return 0.9;
    }

    return 0;
}

/**
 * Find best fuzzy match based on name similarity
 */
function findBestFuzzyMatch(
    product: ExtractedProduct,
    catalogue: CatalogueEntry[]
): { entry: CatalogueEntry; confidence: number } | null {
    let bestMatch: CatalogueEntry | null = null;
    let bestScore = 0;

    const productName = normalizeString(product.name);

    for (const entry of catalogue) {
        // Combine available fields for matching
        const entryName = normalizeString(entry.category + entry.color);
        const similarity = levenshteinSimilarity(productName, entryName);

        if (similarity > bestScore && similarity > 0.5) {
            bestScore = similarity;
            bestMatch = entry;
        }
    }

    if (bestMatch && bestScore > 0.5) {
        return { entry: bestMatch, confidence: Math.round(bestScore * 60) };
    }

    return null;
}

/**
 * Calculate Levenshtein similarity (0-1)
 */
function levenshteinSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance
 */
function levenshteinDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Get match statistics
 */
export function getMatchStats(results: MatchResult[]): {
    total: number;
    matched: number;
    eanMatches: number;
    articleMatches: number;
    fuzzyMatches: number;
    noMatch: number;
    avgConfidence: number;
} {
    const matched = results.filter(r => r.confidence > 0);

    return {
        total: results.length,
        matched: matched.length,
        eanMatches: results.filter(r => r.matchType === "ean").length,
        articleMatches: results.filter(r => r.matchType === "article").length,
        fuzzyMatches: results.filter(r => r.matchType === "fuzzy" || r.matchType === "style_color_size").length,
        noMatch: results.filter(r => r.matchType === "none").length,
        avgConfidence: matched.length > 0
            ? Math.round(matched.reduce((sum, r) => sum + r.confidence, 0) / matched.length)
            : 0,
    };
}
