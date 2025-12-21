/**
 * Catalogue Parser Service
 * Parses CSV/XLSX catalogue files from fashion brands (Acne Studios, Guess, etc.)
 * into a structured format for product matching.
 */

export interface CatalogueEntry {
    // Identity
    ean: string;
    articleNumber: string;
    styleCode: string;
    colorCode: string;
    sizeCode: string;

    // Product Details
    name: string;
    color: string;
    size: string;
    category: string;
    gender: string;

    // Pricing
    wholesalePrice: number;
    retailPrice: number;
    currency: string;

    // Additional
    composition: string;
    countryOfOrigin: string;
    season: string;
    brand: string;

    // Raw data for debugging
    rawRow?: Record<string, string>;
}

export interface ParsedCatalogue {
    name: string;
    brand: string;
    entries: CatalogueEntry[];
    headers: string[];
    parseErrors: string[];
}

// Known column mappings for different brand formats
const COLUMN_MAPPINGS: Record<string, Record<string, string>> = {
    // Acne Studios format
    acne: {
        ean: "EAN code",
        articleNumber: "Article number",
        color: "Color",
        colorCode: "Color Id",
        size: "Size",
        sizeCode: "Size Id",
        category: "Category",
        gender: "Gender",
        wholesalePrice: "WS price",
        retailPrice: "EUR Retail",
        currency: "Currency code",
        composition: "Composition",
        countryOfOrigin: "Country of origin",
        season: "Season sales sell in",
        brand: "Customer name",
    },
    // Generic fallback
    generic: {
        ean: "ean",
        articleNumber: "article",
        color: "color",
        size: "size",
        wholesalePrice: "price",
        retailPrice: "retail",
    },
};

/**
 * Parse a CSV string into CatalogueEntry objects
 */
export function parseCSV(csvContent: string, brandHint?: string): ParsedCatalogue {
    const lines = csvContent.split("\n");
    if (lines.length === 0) {
        return { name: "", brand: "", entries: [], headers: [], parseErrors: ["Empty CSV file"] };
    }

    // Parse header row
    const headers = parseCSVLine(lines[0]);

    // Detect brand from headers or content
    const brand = detectBrand(headers, brandHint);
    const mapping = COLUMN_MAPPINGS[brand] || COLUMN_MAPPINGS.generic;

    // Map header names to indices
    const headerIndices: Record<string, number> = {};
    headers.forEach((h, i) => {
        const normalizedHeader = h.trim().toLowerCase();
        headerIndices[normalizedHeader] = i;
        // Also store original
        headerIndices[h.trim()] = i;
    });

    const entries: CatalogueEntry[] = [];
    const parseErrors: string[] = [];

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
            const values = parseCSVLine(line);
            const rawRow: Record<string, string> = {};
            headers.forEach((h, idx) => {
                rawRow[h] = values[idx] || "";
            });

            const entry = mapRowToEntry(values, headers, mapping, rawRow);
            if (entry.ean || entry.articleNumber) {
                entries.push(entry);
            }
        } catch (err) {
            parseErrors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Parse error"}`);
        }
    }

    return {
        name: `${brand} Catalogue`,
        brand,
        entries,
        headers,
        parseErrors,
    };
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());

    return result;
}

/**
 * Detect brand from header patterns
 */
function detectBrand(headers: string[], hint?: string): string {
    const headerStr = headers.join(" ").toLowerCase();

    if (hint) {
        if (hint.toLowerCase().includes("acne")) return "acne";
        if (hint.toLowerCase().includes("guess")) return "guess";
    }

    // Acne Studios specific headers
    if (headerStr.includes("nuorder") || headerStr.includes("acne")) {
        return "acne";
    }

    return "generic";
}

/**
 * Map CSV row values to CatalogueEntry
 */
function mapRowToEntry(
    values: string[],
    headers: string[],
    mapping: Record<string, string>,
    rawRow: Record<string, string>
): CatalogueEntry {
    const getValue = (key: string): string => {
        const targetHeader = mapping[key];
        if (!targetHeader) return "";

        const idx = headers.findIndex(h =>
            h.toLowerCase().includes(targetHeader.toLowerCase()) ||
            targetHeader.toLowerCase().includes(h.toLowerCase())
        );
        return idx >= 0 ? (values[idx] || "") : "";
    };

    const getNumber = (key: string): number => {
        const val = getValue(key);
        const parsed = parseFloat(val.replace(/[^0-9.-]/g, ""));
        return isNaN(parsed) ? 0 : parsed;
    };

    // Extract article number and parse style/color/size codes
    const articleNumber = getValue("articleNumber");
    const { styleCode, colorCode, sizeCode } = parseArticleNumber(articleNumber);

    return {
        ean: getValue("ean"),
        articleNumber,
        styleCode: styleCode || "",
        colorCode: getValue("colorCode") || colorCode || "",
        sizeCode: getValue("sizeCode") || sizeCode || "",
        name: "", // Usually not in catalogue, derived from style
        color: getValue("color"),
        size: getValue("size"),
        category: getValue("category"),
        gender: getValue("gender"),
        wholesalePrice: getNumber("wholesalePrice"),
        retailPrice: getNumber("retailPrice"),
        currency: getValue("currency") || "EUR",
        composition: getValue("composition"),
        countryOfOrigin: getValue("countryOfOrigin"),
        season: getValue("season"),
        brand: getValue("brand") || "Unknown",
        rawRow,
    };
}

/**
 * Parse article number into component parts
 * Format examples: C00039-228D25, B60285-990105
 */
function parseArticleNumber(articleNumber: string): {
    styleCode: string;
    colorCode: string;
    sizeCode: string;
} {
    if (!articleNumber) {
        return { styleCode: "", colorCode: "", sizeCode: "" };
    }

    // Pattern: STYLE-COLORSIZE or STYLE-COLOR
    const parts = articleNumber.split("-");
    if (parts.length < 2) {
        return { styleCode: articleNumber, colorCode: "", sizeCode: "" };
    }

    const styleCode = parts[0];
    const colorSizeStr = parts[1];

    // Color code is typically 2-3 chars, size code follows
    // Examples: 228D25 (color=228, size=D25), BM0105 (color=BM0, size=105)
    // Try to detect the split point
    let colorCode = "";
    let sizeCode = "";

    // Look for a transition from letters/numbers that indicates size start
    for (let i = 2; i <= Math.min(4, colorSizeStr.length); i++) {
        const maybeColor = colorSizeStr.slice(0, i);
        const maybeSize = colorSizeStr.slice(i);

        // Size codes often start with letter (D, B) or are all numbers (102-106)
        if (maybeSize.length > 0 && (
            /^[A-Z]\d+$/.test(maybeSize) ||  // D25, B28
            /^\d{3}$/.test(maybeSize)         // 102, 103, 104
        )) {
            colorCode = maybeColor;
            sizeCode = maybeSize;
            break;
        }
    }

    // If no match found, take first 3 as color
    if (!colorCode && colorSizeStr.length > 3) {
        colorCode = colorSizeStr.slice(0, 3);
        sizeCode = colorSizeStr.slice(3);
    } else if (!colorCode) {
        colorCode = colorSizeStr;
    }

    return { styleCode, colorCode, sizeCode };
}

/**
 * Parse XLSX file (requires xlsx library)
 * Returns raw data - caller should use parseCSV-like logic
 */
export async function parseXLSX(buffer: ArrayBuffer): Promise<string> {
    // Note: This would require the 'xlsx' package
    // For now, return a placeholder - implement when needed
    throw new Error("XLSX parsing not yet implemented. Please convert to CSV.");
}
