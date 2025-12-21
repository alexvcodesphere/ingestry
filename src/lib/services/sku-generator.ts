import { createClient } from "@/lib/supabase/server";
import type { Supplier, Category } from "@/types";

export interface SkuComponents {
    brand: string;
    season: string;
    category: string;
    gender: string;
    productNumber: number;
}

export interface SkuMappings {
    brandCode: string;
    categoryCode: string;
}

/**
 * Get brand code from database
 */
export async function getBrandCode(brandName: string): Promise<string> {
    const supabase = await createClient();
    const normalized = brandName.toLowerCase().trim();

    const { data } = await supabase
        .from("suppliers")
        .select("brand_code")
        .ilike("brand_name", normalized)
        .limit(1)
        .single();

    return (data as Supplier | null)?.brand_code || "XX";
}

/**
 * Get category code from database
 */
export async function getCategoryCode(categoryName: string): Promise<string> {
    const supabase = await createClient();
    const normalized = categoryName.toLowerCase().trim();

    const { data } = await supabase
        .from("categories")
        .select("code")
        .ilike("name", `%${normalized}%`)
        .limit(1)
        .single();

    return (data as Category | null)?.code || "00";
}

/**
 * Generate a SKU based on product attributes
 * Format: [BrandCode]-[Season]-[Category]-[Gender]-[Number]
 * Example: AC-AW24-01-M-00001
 */
export function generateSku(
    components: SkuComponents,
    mappings: SkuMappings
): string {
    // Parse season (e.g., "AW24", "SS25", "Autumn Winter 2024")
    let seasonCode = components.season.toUpperCase().replace(/\s/g, "");

    // Try to normalize season format
    if (seasonCode.includes("AUTUMN") || seasonCode.includes("FALL")) {
        const yearMatch = seasonCode.match(/\d{2,4}/);
        const year = yearMatch ? yearMatch[0].slice(-2) : "24";
        seasonCode = `AW${year}`;
    } else if (seasonCode.includes("SPRING") || seasonCode.includes("SUMMER")) {
        const yearMatch = seasonCode.match(/\d{2,4}/);
        const year = yearMatch ? yearMatch[0].slice(-2) : "24";
        seasonCode = `SS${year}`;
    } else if (seasonCode.length > 6) {
        // Truncate if too long
        seasonCode = seasonCode.slice(0, 6);
    }

    // Gender code
    let genderCode: string;
    const genderLower = components.gender.toLowerCase();
    if (genderLower.includes("men") && !genderLower.includes("women")) {
        genderCode = "M";
    } else if (genderLower.includes("women") || genderLower.includes("female")) {
        genderCode = "W";
    } else {
        genderCode = "U"; // Unisex
    }

    // Product number (padded to 5 digits)
    const numPadded = String(components.productNumber).padStart(5, "0");

    return `${mappings.brandCode}-${seasonCode}-${mappings.categoryCode}-${genderCode}-${numPadded}`;
}

/**
 * Generate SKUs for multiple products
 */
export async function generateSkusForProducts(
    products: Omit<SkuComponents, "productNumber">[],
    startNumber: number = 1
): Promise<string[]> {
    const skus: string[] = [];

    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const brandCode = await getBrandCode(product.brand);
        const categoryCode = await getCategoryCode(product.category);

        const sku = generateSku(
            { ...product, productNumber: startNumber + i },
            { brandCode, categoryCode }
        );
        skus.push(sku);
    }

    return skus;
}
