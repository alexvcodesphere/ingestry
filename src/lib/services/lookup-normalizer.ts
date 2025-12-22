/**
 * Lookup Normalizer Service
 * Normalizes raw values using lookup type aliases from code_lookups table.
 * Supports exact matching, alias matching, fuzzy matching, and compound value handling.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Match result with metadata about how the match was found
 */
export interface NormalizationResult {
    normalized: string;
    code: string;
    matchType: 'exact' | 'alias' | 'fuzzy' | 'compound' | 'none';
    matchedEntry?: {
        name: string;
        aliases?: string[];
    };
    distance?: number; // For fuzzy matches
    originalPart?: string; // For compound matches, shows which part matched
}

/**
 * Split compound values like "WHITE/PEARL" or "PALE ROSE" into parts
 */
function splitCompoundValue(value: string): string[] {
    // Common separators in product data (including space for multi-word colors)
    const separators = /[\s\/,&\-\+]+/;
    const parts = value.split(separators)
        .map(p => p.trim())
        .filter(p => p.length > 0);
    return parts;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching when exact/alias matches fail
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[a.length][b.length];
}

/**
 * Get fuzzy match threshold based on string length
 * Very conservative to avoid false positives like mint→pink
 */
function getFuzzyThreshold(length: number): number {
    // Only allow 1 character difference for short words
    // Colors like 'mint' and 'pink' have distance 2, so this prevents false matches
    if (length <= 4) return 1;
    if (length <= 7) return 2;
    return 3;
}

/**
 * Normalize a raw value using a lookup type with full metadata
 * Returns detailed information about the match for debugging/testing
 */
export async function normalizeWithDetails(
    rawValue: string,
    lookupType: string,
    useFuzzy: boolean = true
): Promise<NormalizationResult> {
    if (!rawValue || !lookupType) {
        return { normalized: rawValue, code: '', matchType: 'none' };
    }

    const supabase = await createClient();
    const normalized = rawValue.toLowerCase().trim();

    // Fetch all lookups for this type
    const { data: lookups } = await supabase
        .from('code_lookups')
        .select('name, code, aliases')
        .eq('type', lookupType);

    if (!lookups || lookups.length === 0) {
        return { normalized: rawValue, code: '', matchType: 'none' };
    }

    // Step 1: Try exact match on name
    for (const lookup of lookups) {
        if (lookup.name.toLowerCase().trim() === normalized) {
            return {
                normalized: lookup.name,
                code: lookup.code,
                matchType: 'exact',
                matchedEntry: { name: lookup.name, aliases: lookup.aliases }
            };
        }
    }

    // Step 2: Try exact match on aliases
    for (const lookup of lookups) {
        if (lookup.aliases && Array.isArray(lookup.aliases)) {
            const matchedAlias = lookup.aliases.find(
                (alias: string) => alias.toLowerCase().trim() === normalized
            );
            if (matchedAlias) {
                return {
                    normalized: lookup.name,
                    code: lookup.code,
                    matchType: 'alias',
                    matchedEntry: { name: lookup.name, aliases: lookup.aliases }
                };
            }
        }
    }

    // Step 3: Try fuzzy matching if enabled
    if (useFuzzy) {
        const threshold = getFuzzyThreshold(normalized.length);
        let bestMatch: { lookup: typeof lookups[0]; distance: number; matchedOn: string } | null = null;

        for (const lookup of lookups) {
            // Check fuzzy match on name
            const nameDistance = levenshteinDistance(normalized, lookup.name.toLowerCase().trim());
            if (nameDistance <= threshold && (!bestMatch || nameDistance < bestMatch.distance)) {
                bestMatch = { lookup, distance: nameDistance, matchedOn: lookup.name };
            }

            // Check fuzzy match on aliases
            if (lookup.aliases && Array.isArray(lookup.aliases)) {
                for (const alias of lookup.aliases) {
                    const aliasNormalized = alias.toLowerCase().trim();
                    const aliasDistance = levenshteinDistance(normalized, aliasNormalized);
                    if (aliasDistance <= threshold && (!bestMatch || aliasDistance < bestMatch.distance)) {
                        bestMatch = { lookup, distance: aliasDistance, matchedOn: alias };
                    }
                }
            }
        }

        if (bestMatch) {
            return {
                normalized: bestMatch.lookup.name,
                code: bestMatch.lookup.code,
                matchType: 'fuzzy',
                matchedEntry: { name: bestMatch.lookup.name, aliases: bestMatch.lookup.aliases },
                distance: bestMatch.distance
            };
        }
    }

    // Step 4: Try compound value splitting (e.g., "WHITE/PEARL" → try "WHITE", then "PEARL")
    const parts = splitCompoundValue(rawValue);
    if (parts.length > 1) {
        for (const part of parts) {
            const partNormalized = part.toLowerCase().trim();

            // Try exact match on part
            for (const lookup of lookups) {
                if (lookup.name.toLowerCase().trim() === partNormalized) {
                    return {
                        normalized: lookup.name,
                        code: lookup.code,
                        matchType: 'compound',
                        matchedEntry: { name: lookup.name, aliases: lookup.aliases },
                        originalPart: part
                    };
                }
            }

            // Try alias match on part
            for (const lookup of lookups) {
                if (lookup.aliases && Array.isArray(lookup.aliases)) {
                    const matchedAlias = lookup.aliases.find(
                        (alias: string) => alias.toLowerCase().trim() === partNormalized
                    );
                    if (matchedAlias) {
                        return {
                            normalized: lookup.name,
                            code: lookup.code,
                            matchType: 'compound',
                            matchedEntry: { name: lookup.name, aliases: lookup.aliases },
                            originalPart: part
                        };
                    }
                }
            }
        }
    }

    // No match found
    return { normalized: rawValue, code: '', matchType: 'none' };
}

/**
 * Normalize a raw value using a lookup type's aliases
 * Returns the canonical name if found, otherwise returns the original value
 * 
 * This is the simple interface for use in the processing pipeline
 */
export async function normalizeUsingLookup(
    rawValue: string,
    lookupType: string,
    useFuzzy: boolean = true
): Promise<string> {
    const result = await normalizeWithDetails(rawValue, lookupType, useFuzzy);
    return result.normalized;
}

/**
 * Batch normalize multiple values using a lookup type
 */
export async function normalizeMultipleUsingLookup(
    values: string[],
    lookupType: string
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const value of values) {
        const normalized = await normalizeUsingLookup(value, lookupType);
        results.set(value, normalized);
    }

    return results;
}

