import { createClient } from "@/lib/supabase/server";
import type { Color } from "@/types";

/**
 * Normalize a raw color string to a canonical color name
 * Uses database lookups with alias matching and fuzzy search
 */
export async function normalizeColor(rawColor: string): Promise<string> {
    if (!rawColor || rawColor.trim() === "") {
        return "Unknown";
    }

    const supabase = await createClient();
    const normalized = rawColor.toLowerCase().trim();

    // 1. Try exact match on canonical name
    const { data: exactMatch } = await supabase
        .from("colors")
        .select("canonical_name")
        .ilike("canonical_name", normalized)
        .limit(1)
        .single();

    if (exactMatch) {
        return exactMatch.canonical_name;
    }

    // 2. Try alias match
    const { data: allColors } = await supabase
        .from("colors")
        .select("canonical_name, aliases");

    if (allColors) {
        for (const color of allColors as Color[]) {
            if (color.aliases?.some((alias) => alias.toLowerCase() === normalized)) {
                return color.canonical_name;
            }
        }

        // 3. Fuzzy match - check if raw color contains or is contained by canonical/alias
        for (const color of allColors as Color[]) {
            const canonicalLower = color.canonical_name.toLowerCase();
            if (
                normalized.includes(canonicalLower) ||
                canonicalLower.includes(normalized)
            ) {
                return color.canonical_name;
            }
            for (const alias of color.aliases || []) {
                const aliasLower = alias.toLowerCase();
                if (normalized.includes(aliasLower) || aliasLower.includes(normalized)) {
                    return color.canonical_name;
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
