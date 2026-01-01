/**
 * Catalog Reconciler Service
 * Matches extracted values against catalog entries using exact matching.
 * Supports alias matching, fuzzy matching, and compound value handling.
 * 
 * Key change from lookup-normalizer: The AI now receives a "Catalog Match Guide"
 * enabling it to reconcile synonyms during extraction. This service performs
 * exact-match lookups on the pre-resolved values.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Result of catalog reconciliation with metadata
 */
export interface ReconciliationResult {
    normalized: string;
    code: string;
    matchType: 'exact' | 'alias' | 'fuzzy' | 'compound' | 'none';
    matchedEntry?: {
        name: string;
        aliases?: string[];
        extra_data?: Record<string, unknown>;
    };
    extra_data?: Record<string, unknown>;  // Custom column values for templates
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

// ============ CATALOG CACHE FOR PERFORMANCE ============

interface CatalogEntry {
    name: string;
    code: string;
    aliases?: string[];
    extra_data?: Record<string, unknown>;
}

/** In-memory cache of catalog entries, keyed by catalog key */
let catalogCache: Map<string, CatalogEntry[]> = new Map();

/**
 * Get the Catalog Match Guide for AI prompt injection.
 * Returns a formatted string listing valid catalog names for each key.
 * This enables the AI to reconcile synonyms during extraction.
 */
export async function getCatalogMatchGuide(catalogKeys: string[]): Promise<string> {
    if (catalogKeys.length === 0) return '';
    
    const supabase = await createClient();
    
    const { data } = await supabase
        .from('code_lookups')
        .select('field_key, name')
        .in('field_key', catalogKeys);
    
    if (!data || data.length === 0) return '';
    
    // Group by field_key
    const grouped = data.reduce((acc, row) => {
        if (!acc[row.field_key]) acc[row.field_key] = [];
        acc[row.field_key].push(row.name);
        return acc;
    }, {} as Record<string, string[]>);
    
    // Format as guide for AI
    return Object.entries(grouped)
        .map(([key, names]) => `${key}: ${names.join(', ')}`)
        .join('\n');
}

/**
 * Prefetch all catalog entries for a set of catalog keys in ONE database query.
 * Call this before processing to avoid N+1 query problems.
 */
export async function prefetchCatalog(catalogKeys: string[]): Promise<void> {
    if (catalogKeys.length === 0) return;
    
    const supabase = await createClient();
    
    // Fetch all lookups for all types in one query
    const { data: lookups } = await supabase
        .from('code_lookups')
        .select('field_key, name, code, aliases, extra_data')
        .in('field_key', catalogKeys);
    
    if (!lookups) return;
    
    // Group by field_key and cache
    catalogCache = new Map();
    for (const lookup of lookups) {
        const existing = catalogCache.get(lookup.field_key) || [];
        existing.push({
            name: lookup.name,
            code: lookup.code,
            aliases: lookup.aliases,
            extra_data: lookup.extra_data,
        });
        catalogCache.set(lookup.field_key, existing);
    }
    
    console.log(`[CatalogReconciler] Prefetched ${lookups.length} entries for ${catalogKeys.length} catalog keys`);
}

/**
 * Clear the catalog cache (call after processing is complete)
 */
export function clearCatalogCache(): void {
    catalogCache.clear();
}

/**
 * Get the current catalog cache
 * Useful for passing to other services (like template engine) to avoid re-fetching
 */
export function getCatalogCache(): Map<string, CatalogEntry[]> {
    return catalogCache;
}

/**
 * Get catalog entries for a key, using cache if available, otherwise fetch
 */
async function getCatalogEntriesForKey(catalogKey: string): Promise<CatalogEntry[]> {
    // Check cache first
    if (catalogCache.has(catalogKey)) {
        return catalogCache.get(catalogKey)!;
    }
    
    // Fallback to database query if not cached
    const supabase = await createClient();
    const { data: lookups } = await supabase
        .from('code_lookups')
        .select('name, code, aliases, extra_data')
        .eq('field_key', catalogKey);
    
    const entries: CatalogEntry[] = (lookups || []).map(l => ({
        name: l.name,
        code: l.code,
        aliases: l.aliases,
        extra_data: l.extra_data,
    }));
    
    // Cache for future lookups
    catalogCache.set(catalogKey, entries);
    
    return entries;
}

// ============ END CATALOG CACHE ============

/**
 * Reconcile a value against catalog entries with full metadata
 * Returns detailed information about the match for debugging/testing
 * 
 * This is the primary function for post-extraction reconciliation.
 * The AI should have already resolved synonyms using the Catalog Match Guide,
 * so this function primarily performs exact-match lookups to retrieve
 * the .code and extra_data for the template engine.
 */
export async function reconcileMetadata(
    rawValue: string,
    catalogKey: string,
    useFuzzy: boolean = true
): Promise<ReconciliationResult> {
    if (!rawValue || !catalogKey) {
        return { normalized: rawValue, code: '', matchType: 'none' };
    }

    const normalized = rawValue.toLowerCase().trim();

    // Get catalog entries from cache or database
    const entries = await getCatalogEntriesForKey(catalogKey);

    if (entries.length === 0) {
        return { normalized: rawValue, code: '', matchType: 'none' };
    }

    // Step 1: Try exact match on name
    for (const entry of entries) {
        if (entry.name.toLowerCase().trim() === normalized) {
            return {
                normalized: entry.name,
                code: entry.code,
                matchType: 'exact',
                matchedEntry: { name: entry.name, aliases: entry.aliases, extra_data: entry.extra_data },
                extra_data: entry.extra_data || {}
            };
        }
    }

    // Step 2: Try exact match on aliases
    for (const entry of entries) {
        if (entry.aliases && Array.isArray(entry.aliases)) {
            const matchedAlias = entry.aliases.find(
                (alias: string) => alias.toLowerCase().trim() === normalized
            );
            if (matchedAlias) {
                return {
                    normalized: entry.name,
                    code: entry.code,
                    matchType: 'alias',
                    matchedEntry: { name: entry.name, aliases: entry.aliases, extra_data: entry.extra_data },
                    extra_data: entry.extra_data || {}
                };
            }
        }
    }

    // Step 3: Try fuzzy matching if enabled
    if (useFuzzy) {
        const threshold = getFuzzyThreshold(normalized.length);
        let bestMatch: { entry: typeof entries[0]; distance: number; matchedOn: string } | null = null;

        for (const entry of entries) {
            // Check fuzzy match on name
            const nameDistance = levenshteinDistance(normalized, entry.name.toLowerCase().trim());
            if (nameDistance <= threshold && (!bestMatch || nameDistance < bestMatch.distance)) {
                bestMatch = { entry, distance: nameDistance, matchedOn: entry.name };
            }

            // Check fuzzy match on aliases
            if (entry.aliases && Array.isArray(entry.aliases)) {
                for (const alias of entry.aliases) {
                    const aliasNormalized = alias.toLowerCase().trim();
                    const aliasDistance = levenshteinDistance(normalized, aliasNormalized);
                    if (aliasDistance <= threshold && (!bestMatch || aliasDistance < bestMatch.distance)) {
                        bestMatch = { entry, distance: aliasDistance, matchedOn: alias };
                    }
                }
            }
        }

        if (bestMatch) {
            return {
                normalized: bestMatch.entry.name,
                code: bestMatch.entry.code,
                matchType: 'fuzzy',
                matchedEntry: { name: bestMatch.entry.name, aliases: bestMatch.entry.aliases, extra_data: bestMatch.entry.extra_data },
                extra_data: bestMatch.entry.extra_data || {},
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
            for (const entry of entries) {
                if (entry.name.toLowerCase().trim() === partNormalized) {
                    return {
                        normalized: entry.name,
                        code: entry.code,
                        matchType: 'compound',
                        matchedEntry: { name: entry.name, aliases: entry.aliases, extra_data: entry.extra_data },
                        extra_data: entry.extra_data || {},
                        originalPart: part
                    };
                }
            }

            // Try alias match on part
            for (const entry of entries) {
                if (entry.aliases && Array.isArray(entry.aliases)) {
                    const matchedAlias = entry.aliases.find(
                        (alias: string) => alias.toLowerCase().trim() === partNormalized
                    );
                    if (matchedAlias) {
                        return {
                            normalized: entry.name,
                            code: entry.code,
                            matchType: 'compound',
                            matchedEntry: { name: entry.name, aliases: entry.aliases, extra_data: entry.extra_data },
                            extra_data: entry.extra_data || {},
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
 * Match a raw value against catalog entries
 * Returns the canonical name if found, otherwise returns the original value
 * 
 * This is the simple interface for use in the processing pipeline
 */
export async function matchAgainstCatalog(
    rawValue: string,
    catalogKey: string,
    useFuzzy: boolean = true
): Promise<string> {
    const result = await reconcileMetadata(rawValue, catalogKey, useFuzzy);
    return result.normalized;
}

/**
 * Batch match multiple values against a catalog
 */
export async function matchMultipleAgainstCatalog(
    values: string[],
    catalogKey: string
): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const value of values) {
        const matched = await matchAgainstCatalog(value, catalogKey);
        results.set(value, matched);
    }

    return results;
}
