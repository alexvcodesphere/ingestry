/**
 * Draft Order Line Items API Routes
 * PATCH: Update line items (for inline editing)
 * POST: Approve line items, regenerate SKUs, or bulk update
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getDraftOrder,
    updateLineItem,
    approveLineItems,
    approveAllLineItems,
} from '@/lib/services/draft-order.service';
import { evaluateTemplate, type TemplateContext } from '@/lib/services/template-engine';
import { enrichProducts, type EnrichmentField } from '@/lib/services/ai-enrichment';
import { prefetchCatalog, clearCatalogCache, getCatalogCache } from '@/lib/services/catalog-reconciler';
import type { NormalizedProduct } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * PATCH /api/draft-orders/[id]/line-items
 * Update one or more line items
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: orderId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Verify existence
        const order = await getDraftOrder(orderId);
        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }
        
        // Ownership check removed: RLS handles tenant isolation

        const body = await request.json();
        const { lineItemId, lineItemIds, updates } = body as {
            lineItemId?: string;
            lineItemIds?: string[];
            updates: Partial<NormalizedProduct>;
        };

        // Handle bulk update
        if (lineItemIds && lineItemIds.length > 0 && updates) {
            // Note: This is still calling updateLineItem in a loop. 
            // In a future refactor, this could be optimized to a single RPC or batch update.
            const results = await Promise.all(
                lineItemIds.map(id => updateLineItem(id, updates))
            );
            const successCount = results.filter(Boolean).length;
            return NextResponse.json({
                success: true,
                data: { updatedCount: successCount },
            });
        }

        // Handle single update
        if (!lineItemId || !updates) {
            return NextResponse.json(
                { success: false, error: 'lineItemId and updates are required' },
                { status: 400 }
            );
        }

        const updated = await updateLineItem(lineItemId, updates);

        if (!updated) {
            return NextResponse.json(
                { success: false, error: 'Failed to update line item' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        console.error('PATCH /api/draft-orders/[id]/line-items error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/draft-orders/[id]/line-items
 * Approve line items or regenerate SKUs
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: orderId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Verify existence
        const order = await getDraftOrder(orderId);
        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }
        
        // Ownership check removed: RLS handles tenant isolation

        const body = await request.json();
        const { action, lineItemIds, fieldKeys } = body as {
            action: 'approve' | 'approve_all' | 'unapprove' | 'regenerate_sku' | 'regenerate_templates';
            lineItemIds?: string[];
            fieldKeys?: string[]; // Optional: specific fields to regenerate (if empty, regenerate all)
        };

        // Handle approve all
        if (action === 'approve_all') {
            const result = await approveAllLineItems(orderId);
            return NextResponse.json({
                success: result.success,
                data: { approvedCount: result.count },
            });
        }

        // Handle approve selected
        if (action === 'approve' && lineItemIds?.length) {
            const result = await approveLineItems(lineItemIds);
            return NextResponse.json({
                success: result.success,
                data: { approvedCount: result.count },
            });
        }

        // Handle unapprove selected
        if (action === 'unapprove' && lineItemIds?.length) {
            const { error } = await supabase
                .from('draft_line_items')
                .update({ status: 'validated' })
                .in('id', lineItemIds);
            
            if (error) {
                return NextResponse.json(
                    { success: false, error: 'Failed to unapprove items' },
                    { status: 500 }
                );
            }
            
            // Update order status back to pending_review since not all items are approved
            await supabase
                .from('draft_orders')
                .update({ status: 'pending_review' })
                .eq('id', orderId);
            
            return NextResponse.json({
                success: true,
                data: { unapprovedCount: lineItemIds.length },
            });
        }

        // Handle template field regeneration using latest profile
        if ((action === 'regenerate_templates' || action === 'regenerate_sku') && lineItemIds?.length) {
            // Fetch draft order to get the profile ID
            const { data: draftOrder, error: orderError } = await supabase
                .from('draft_orders')
                .select('metadata')
                .eq('id', orderId)
                .single();
            
            if (orderError) {
                return NextResponse.json(
                    { success: false, error: 'Failed to fetch order' },
                    { status: 500 }
                );
            }

            // Get the processing profile - prefer order's profile, fallback to default
            const profileId = draftOrder?.metadata?.profile_id;
            const { data: profile, error: profileError } = await supabase
                .from('input_profiles')
                .select('*')
                .eq(profileId ? 'id' : 'is_default', profileId || true)
                .single();

            if (profileError || !profile) {
                return NextResponse.json(
                    { success: false, error: 'No processing profile found' },
                    { status: 400 }
                );
            }

            // Get templated fields from profile (support old and new patterns)
            let templatedFields = (profile.fields || []).filter(
                (f: { use_template?: boolean; template?: string; source?: string; logic_type?: string }) => 
                    // New pattern: computed field with template logic
                    (f.source === 'computed' && f.logic_type === 'template' && f.template) ||
                    // Old pattern: use_template flag
                    (f.use_template && f.template)
            );

            // Get AI enrichment fields from profile
            let aiEnrichmentFields = (profile.fields || []).filter(
                (f: { source?: string; logic_type?: string; ai_prompt?: string }) => 
                    f.source === 'computed' && f.logic_type === 'ai_enrichment' && f.ai_prompt
            );

            // SELECTIVE REGENERATION: Filter to specific fields if fieldKeys provided
            if (fieldKeys && fieldKeys.length > 0) {
                const fieldKeySet = new Set(fieldKeys);
                templatedFields = templatedFields.filter(
                    (f: { key: string }) => fieldKeySet.has(f.key)
                );
                aiEnrichmentFields = aiEnrichmentFields.filter(
                    (f: { key: string }) => fieldKeySet.has(f.key)
                );
            }

            if (templatedFields.length === 0 && aiEnrichmentFields.length === 0) {
                return NextResponse.json(
                    { success: false, error: 'No computed fields in profile' },
                    { status: 400 }
                );
            }

            // Fetch the line items
            const { data: items, error: fetchError } = await supabase
                .from('draft_line_items')
                .select('id, normalized_data, line_number')
                .in('id', lineItemIds);

            if (fetchError || !items) {
                return NextResponse.json(
                    { success: false, error: 'Failed to fetch line items' },
                    { status: 500 }
                );
            }

            // --- BATCH PERFORMANCE FIX: PREFETCH CATALOG ---
            const catalogKeys = profile.fields
                .filter((f: { catalog_key?: string }) => f.catalog_key)
                .map((f: { catalog_key: string }) => f.catalog_key);
            
            if (catalogKeys.length > 0) {
                await prefetchCatalog(catalogKeys);
            }

            // Build lookup maps for template engine (once)
            const cache = getCatalogCache();
            const codeLookups = new Map();
            const extraDataLookups = new Map();
            for (const [type, entries] of cache.entries()) {
                const codeMap = new Map();
                const extraMap = new Map();
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
                    const enrichmentFieldsInput: EnrichmentField[] = aiEnrichmentFields.map((f: { key: string; label: string; ai_prompt: string; fallback?: string }) => ({
                        key: f.key,
                        label: f.label,
                        ai_prompt: f.ai_prompt,
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
                    return NextResponse.json({ success: false, error: 'Failed to save some changes' }, { status: 500 });
                }
            }

            clearCatalogCache();

            const allFieldKeys = [
                ...templatedFields.map((f: { key: string }) => f.key),
                ...aiEnrichmentFields.map((f: { key: string }) => f.key),
            ];

            return NextResponse.json({
                success: true,
                data: { regeneratedCount: batchUpdates.length, fieldsUpdated: allFieldKeys },
            });
        }

        return NextResponse.json(
            { success: false, error: 'Invalid action or missing lineItemIds' },
            { status: 400 }
        );
    } catch (error) {
        console.error('POST /api/draft-orders/[id]/line-items error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
