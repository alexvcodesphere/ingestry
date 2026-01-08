/**
 * Regenerate Templates Service
 * 
 * Extracted logic for regenerating computed fields (templates + AI enrichment).
 * Called directly from Spark and the line-items API to avoid internal fetch calls
 * that fail in containerized environments.
 */

import { createClient } from '@/lib/supabase/server';
import { evaluateTemplate, type TemplateContext } from '@/lib/services/template-engine';
import { enrichProducts, type EnrichmentField } from '@/lib/services/ai-enrichment';
import { prefetchCatalog, clearCatalogCache, getCatalogCache } from '@/lib/services/catalog-reconciler';
import type { NormalizedProduct } from '@/types';

interface ProfileField {
    key: string;
    label: string;
    catalog_key?: string;
    type?: 'string' | 'number' | 'boolean';
    source?: 'extracted' | 'computed';
    use_template?: boolean;
    template?: string;
    logic_type?: string;
    ai_prompt?: string;
    fallback?: string;
}

interface RegenerateResult {
    success: boolean;
    regeneratedCount: number;
    fieldsUpdated: string[];
    error?: string;
    items?: Array<{
        id: string;
        data: Record<string, unknown>;
    }>;
}

/**
 * Regenerate template-based and AI-enriched fields for given line items.
 * 
 * @param orderId - The draft order ID
 * @param lineItemIds - IDs of line items to regenerate
 * @param fieldKeys - Optional: specific fields to regenerate (if empty/undefined, regenerate all)
 * @returns Result with count and field keys that were updated
 */
export async function regenerateTemplatesForLineItems(
    orderId: string,
    lineItemIds: string[],
    fieldKeys?: string[]
): Promise<RegenerateResult> {
    const supabase = await createClient();

    // Fetch draft order to get the profile ID
    const { data: draftOrder, error: orderError } = await supabase
        .from('draft_orders')
        .select('metadata')
        .eq('id', orderId)
        .single();

    if (orderError) {
        return { success: false, regeneratedCount: 0, fieldsUpdated: [], error: 'Failed to fetch order' };
    }

    // Get the processing profile - prefer order's profile, fallback to default
    const profileId = draftOrder?.metadata?.profile_id;
    const { data: profile, error: profileError } = await supabase
        .from('input_profiles')
        .select('*')
        .eq(profileId ? 'id' : 'is_default', profileId || true)
        .single();

    if (profileError || !profile) {
        return { success: false, regeneratedCount: 0, fieldsUpdated: [], error: 'No processing profile found' };
    }

    // Get templated fields from profile (support old and new patterns)
    let templatedFields = (profile.fields || []).filter(
        (f: ProfileField) =>
            // New pattern: computed field with template logic
            (f.source === 'computed' && f.logic_type === 'template' && f.template) ||
            // Old pattern: use_template flag
            (f.use_template && f.template)
    );

    // Get AI enrichment fields from profile
    let aiEnrichmentFields = (profile.fields || []).filter(
        (f: ProfileField) =>
            f.source === 'computed' && f.logic_type === 'ai_enrichment' && f.ai_prompt
    );

    // SELECTIVE REGENERATION: Filter to specific fields if fieldKeys provided
    if (fieldKeys && fieldKeys.length > 0) {
        const fieldKeySet = new Set(fieldKeys);
        templatedFields = templatedFields.filter(
            (f: ProfileField) => fieldKeySet.has(f.key)
        );
        aiEnrichmentFields = aiEnrichmentFields.filter(
            (f: ProfileField) => fieldKeySet.has(f.key)
        );
    }

    if (templatedFields.length === 0 && aiEnrichmentFields.length === 0) {
        return { success: false, regeneratedCount: 0, fieldsUpdated: [], error: 'No computed fields in profile' };
    }

    // Fetch the line items
    const { data: items, error: fetchError } = await supabase
        .from('draft_line_items')
        .select('id, normalized_data, line_number')
        .in('id', lineItemIds);

    if (fetchError || !items) {
        return { success: false, regeneratedCount: 0, fieldsUpdated: [], error: 'Failed to fetch line items' };
    }

    // --- BATCH PERFORMANCE FIX: PREFETCH CATALOG ---
    const catalogKeys: string[] = profile.fields
        .filter((f: ProfileField) => f.catalog_key)
        .map((f: ProfileField) => f.catalog_key!);

    if (catalogKeys.length > 0) {
        await prefetchCatalog(catalogKeys);
    }

    // Build lookup maps for template engine (once)
    const cache = getCatalogCache();
    const codeLookups = new Map<string, Map<string, string>>();
    const extraDataLookups = new Map<string, Map<string, Record<string, unknown>>>();
    for (const [type, entries] of cache.entries()) {
        const codeMap = new Map<string, string>();
        const extraMap = new Map<string, Record<string, unknown>>();
        for (const entry of entries) {
            const normalizedName = entry.name.toLowerCase().trim();
            codeMap.set(normalizedName, entry.code);
            if (entry.extra_data) extraMap.set(normalizedName, entry.extra_data);
            if (entry.aliases) {
                for (const alias of entry.aliases) {
                    const normalizedAlias = alias.toLowerCase().trim();
                    codeMap.set(normalizedAlias, entry.code);
                    if (entry.extra_data) extraMap.set(normalizedAlias, entry.extra_data);
                }
            }
        }
        codeLookups.set(type, codeMap);
        extraDataLookups.set(type, extraMap);
    }

    // Build catalog key mapping from profile
    const catalogKeyMapping: Record<string, string> = {};
    for (const field of profile.fields || []) {
        if (field.catalog_key) {
            catalogKeyMapping[field.key] = field.catalog_key;
        }
    }

    const batchUpdates: Array<{
        id: string;
        normalized_data: NormalizedProduct;
        user_modified: boolean;
        status: string;
    }> = [];

    for (const item of items) {
        const data = item.normalized_data as NormalizedProduct;
        if (!data) continue;

        const productValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
            productValues[key] = value !== null && value !== undefined ? String(value) : '';
        }

        const context: TemplateContext = {
            values: productValues,
            sequence: item.line_number || 1,
            catalogKeyMapping,
        };

        const updates: Record<string, string> = {};
        for (const field of templatedFields) {
            try {
                // Optimized: Pass maps to avoid N+1 DB calls
                const newValue = await evaluateTemplate(field.template, context, codeLookups, extraDataLookups);
                updates[field.key] = newValue;
            } catch (err) {
                console.error(`[Regenerate] Failed to evaluate ${field.key}:`, err);
            }
        }

        if (Object.keys(updates).length > 0) {
            batchUpdates.push({
                id: item.id,
                normalized_data: { ...data, ...updates },
                user_modified: true,
                status: 'validated'
            });
        }
    }

    // --- AI ENRICHMENT: Process ai_enrichment fields ---
    if (aiEnrichmentFields.length > 0) {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            const enrichmentFieldsInput: EnrichmentField[] = aiEnrichmentFields.map((f: ProfileField) => ({
                key: f.key,
                label: f.label,
                ai_prompt: f.ai_prompt!,
                fallback: f.fallback,
            }));

            // Prepare products for enrichment (use current data from batchUpdates if available)
            const productsToEnrich = items.map(item => {
                const existing = batchUpdates.find(u => u.id === item.id);
                return {
                    id: item.id,
                    data: existing ? existing.normalized_data : (item.normalized_data as Record<string, unknown> || {}),
                };
            });

            try {
                const enrichmentResults = await enrichProducts(enrichmentFieldsInput, productsToEnrich, geminiKey);

                // Merge enrichment results into batchUpdates
                for (const result of enrichmentResults) {
                    const existingIdx = batchUpdates.findIndex(u => u.id === result.id);
                    if (existingIdx >= 0) {
                        // Merge with existing update
                        batchUpdates[existingIdx].normalized_data = {
                            ...batchUpdates[existingIdx].normalized_data,
                            ...result.enrichments,
                        };
                    } else {
                        // Create new update entry
                        const item = items.find(i => i.id === result.id);
                        if (item) {
                            batchUpdates.push({
                                id: result.id,
                                normalized_data: { ...(item.normalized_data as NormalizedProduct), ...result.enrichments },
                                user_modified: true,
                                status: 'validated',
                            });
                        }
                    }
                }
            } catch (enrichError) {
                console.error('[AI Enrichment] Batch enrichment failed:', enrichError);
                // Continue with template-only updates
            }
        } else {
            console.warn('[AI Enrichment] GEMINI_API_KEY not configured, skipping AI enrichment');
        }
    }

    // --- BATCH UPDATE: Use individual updates (upsert requires all non-null columns) ---
    if (batchUpdates.length > 0) {
        const updatePromises = batchUpdates.map(update =>
            supabase
                .from('draft_line_items')
                .update({
                    normalized_data: update.normalized_data,
                    user_modified: update.user_modified,
                    status: update.status
                })
                .eq('id', update.id)
        );

        const results = await Promise.all(updatePromises);
        const errors = results.filter(r => r.error);

        if (errors.length > 0) {
            console.error('[Regenerate] Some updates failed:', errors.map(e => e.error));
            return { success: false, regeneratedCount: 0, fieldsUpdated: [], error: 'Failed to save some changes' };
        }
    }

    clearCatalogCache();

    const allFieldKeys = [
        ...templatedFields.map((f: ProfileField) => f.key),
        ...aiEnrichmentFields.map((f: ProfileField) => f.key),
    ];

    // Build return items for UI update
    const returnItems = batchUpdates.map(u => ({
        id: u.id,
        data: u.normalized_data as Record<string, unknown>,
    }));

    return {
        success: true,
        regeneratedCount: batchUpdates.length,
        fieldsUpdated: allFieldKeys,
        items: returnItems,
    };
}
