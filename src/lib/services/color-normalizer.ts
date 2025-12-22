import { createClient } from "@/lib/supabase/server";
import type { CodeLookup } from "@/types";

/**
 * Normalize a raw color string to a canonical color name
 * Uses code_lookups table with alias matching and fuzzy search
 */
export async function normalizeColor(rawColor: string): Promise<string> {
    if (!rawColor || rawColor.trim() === "") {
        return "Unknown";
    }

    const supabase = await createClient();
    const normalized = rawColor.toLowerCase().trim();

    // 1. Try exact match on name
    const { data: exactMatch } = await supabase
        .from("code_lookups")
        .select("name")
        .eq("field_key", "color")
        .ilike("name", normalized)
        .limit(1)
        .single();

    if (exactMatch) {
        return exactMatch.name;
    }

    // 2. Try alias match
    const { data: allColors } = await supabase
        .from("code_lookups")
        .select("name, aliases")
        .eq("field_key", "color");

    if (allColors) {
        for (const color of allColors as CodeLookup[]) {
            if (color.aliases?.some((alias: string) => alias.toLowerCase() === normalized)) {
                return color.name;
            }
        }

        // 3. Fuzzy match - check if raw color contains or is contained by canonical/alias
        for (const color of allColors as CodeLookup[]) {
            const nameLower = color.name.toLowerCase();
            if (
                normalized.includes(nameLower) ||
                nameLower.includes(normalized)
            ) {
                return color.name;
            }
            for (const alias of color.aliases || []) {
                const aliasLower = alias.toLowerCase();
                if (normalized.includes(aliasLower) || aliasLower.includes(normalized)) {
                    return color.name;
                }
            }
        }
    }

    // 4. No match found, return original (capitalized)
    return rawColor
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

/**
 * Batch normalize multiple colors
 */
export async function normalizeColors(
    rawColors: string[]
): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uniqueColors = [...new Set(rawColors)];

    for (const color of uniqueColors) {
        result.set(color, await normalizeColor(color));
    }

    return result;
}
