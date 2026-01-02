/**
 * Ingestry Spark API Route
 * POST: Apply AI transformations with undo capability
 * DELETE: Revert a previous Spark session
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sparkAudit, type SparkPatch } from '@/lib/extraction/spark-client';
import { getDraftOrder } from '@/lib/services/draft-order.service';
import { getCatalogMatchGuide } from '@/lib/services/catalog-reconciler';
import { parseFieldValue } from '@/lib/modules/processing/normalizer';
import type { NormalizedProduct } from '@/types';

interface RouteParams {
    params: Promise<{ id: string }>;
}

interface FieldConfig {
    key: string;
    label: string;
    catalog_key?: string;
}

// In-memory session storage for undo capability
// Production: use Redis or a dedicated DB table
const sparkSessions = new Map<string, SparkPatch[]>();

/**
 * POST /api/draft-orders/[id]/spark
 * Apply AI-driven natural language transformations with undo support
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
    const startTime = Date.now();
    const log = (msg: string) => console.log(`[Spark API] +${Date.now() - startTime}ms: ${msg}`);
    
    try {
        const { id: orderId } = await params;
        log('Start');
        
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        log('Auth complete');

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { instruction, lineItemIds, conversationHistory } = body as {
            instruction: string;
            lineItemIds?: string[];
            conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
        };

        if (!instruction?.trim()) {
            return NextResponse.json(
                { success: false, error: 'Instruction is required' },
                { status: 400 }
            );
        }

        // Verify order exists (RLS handles tenant isolation)
        const order = await getDraftOrder(orderId);
        log('Order fetched');
        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        // Get processing profile for field schema
        const profileId = order.metadata?.profile_id as string | undefined;
        const { data: profile } = await supabase
            .from('input_profiles')
            .select('fields')
            .eq(profileId ? 'id' : 'is_default', profileId || true)
            .single();

        const profileFields = (profile?.fields || []) as FieldConfig[];
        const fieldSchema: Record<string, string> = {};
        const fieldKeys: string[] = [];
        const catalogKeys: string[] = [];

        for (const field of profileFields) {
            fieldSchema[field.key] = field.label;
            fieldKeys.push(field.key);
            if (field.catalog_key) {
                catalogKeys.push(field.catalog_key);
            }
        }

        // Fetch line items
        let query = supabase
            .from('draft_line_items')
            .select('id, normalized_data')
            .eq('draft_order_id', orderId);
        
        if (lineItemIds && lineItemIds.length > 0) {
            query = query.in('id', lineItemIds);
        }

        const { data: items, error: fetchError } = await query;
        log(`Line items fetched: ${items?.length || 0}`);
        if (fetchError || !items?.length) {
            return NextResponse.json(
                { success: false, error: 'No line items found' },
                { status: 404 }
            );
        }

        // TOKEN OPTIMIZATION: Filter to only profile-defined fields
        const auditData = items.map(item => {
            const fullData = item.normalized_data as Record<string, unknown>;
            const filteredData: Record<string, unknown> = {};
            for (const key of fieldKeys) {
                if (key in fullData) {
                    filteredData[key] = fullData[key];
                }
            }
            return { id: item.id, data: filteredData };
        });

        // Get catalog guide for context-aware corrections
        let catalogGuide: string | undefined;
        if (catalogKeys.length > 0) {
            catalogGuide = await getCatalogMatchGuide(catalogKeys);
        }

        // Get tenant's configured spark model
        const { data: tenant } = await supabase
            .from('tenants')
            .select('settings')
            .single();
        const sparkModel = tenant?.settings?.spark_model;

        log(`Calling Spark (model: ${sparkModel || 'default'})`);
        
        // Call Spark with configured model and conversation history
        const result = await sparkAudit(
            instruction,
            auditData,
            fieldSchema,
            { catalogGuide, model: sparkModel, conversationHistory }
        );
        log(`Spark complete: ${result.status}, ${result.patches.length} patches`);

        // Handle ambiguous response
        if (result.status === "ambiguous") {
            return NextResponse.json({
                success: true,
                data: {
                    status: "ambiguous",
                    clarification_needed: result.clarification_needed,
                    summary: result.summary,
                    duration: Date.now() - startTime,
                },
            });
        }

        // Handle no changes
        if (result.status === "no_changes" || result.patches.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    status: "no_changes",
                    patchedCount: 0,
                    summary: result.summary || 'No changes needed',
                    duration: Date.now() - startTime,
                },
            });
        }

        // Apply patches with type validation and capture previous state
        const sessionId = `${orderId}-${Date.now()}`;
        const appliedPatches: SparkPatch[] = [];
        const patchedFields = new Set<string>();

        for (const patch of result.patches) {
            const currentItem = items.find(i => i.id === patch.id);
            if (!currentItem) continue;

            const currentData = currentItem.normalized_data as Record<string, unknown>;
            
            // Capture previous values for undo
            const previousData: Record<string, unknown> = {};
            for (const key of Object.keys(patch.updates)) {
                previousData[key] = currentData[key];
                patchedFields.add(key);
            }

            // TYPE VALIDATION: Parse values using normalizer logic
            const typedUpdates: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(patch.updates)) {
                typedUpdates[key] = parseFieldValue(key, String(value));
            }

            const updatedData = { ...currentData, ...typedUpdates };

            const { error: updateError } = await supabase
                .from('draft_line_items')
                .update({
                    normalized_data: updatedData,
                    user_modified: true,
                    status: 'validated',
                })
                .eq('id', patch.id);

            if (!updateError) {
                appliedPatches.push({
                    id: patch.id,
                    updates: typedUpdates,
                    previous_data: previousData,
                });
            }
        }

        // Store session for undo (30 minute TTL)
        sparkSessions.set(sessionId, appliedPatches);
        setTimeout(() => sparkSessions.delete(sessionId), 30 * 60 * 1000);

        console.log(`[Spark] Applied ${appliedPatches.length} patches, session: ${sessionId}`);

        return NextResponse.json({
            success: true,
            data: {
                status: "success",
                sessionId,
                patchedCount: appliedPatches.length,
                patchedIds: appliedPatches.map(p => p.id),
                patchedFields: Array.from(patchedFields),
                triggerRegeneration: result.trigger_regeneration,
                summary: result.summary,
                duration: Date.now() - startTime,
            },
        });
    } catch (error) {
        console.error('POST /api/draft-orders/[id]/spark error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/draft-orders/[id]/spark
 * Revert a previous Spark session
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: orderId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { sessionId } = body as { sessionId: string };

        // Validate session belongs to this order
        if (!sessionId?.startsWith(orderId)) {
            return NextResponse.json(
                { success: false, error: 'Invalid session' },
                { status: 400 }
            );
        }

        const patches = sparkSessions.get(sessionId);
        if (!patches) {
            return NextResponse.json(
                { success: false, error: 'Session expired or not found' },
                { status: 404 }
            );
        }

        // Revert each patch
        let revertedCount = 0;
        for (const patch of patches) {
            const { data: current } = await supabase
                .from('draft_line_items')
                .select('normalized_data')
                .eq('id', patch.id)
                .single();

            if (current) {
                const restoredData = {
                    ...(current.normalized_data as Record<string, unknown>),
                    ...patch.previous_data,
                };

                const { error } = await supabase
                    .from('draft_line_items')
                    .update({ normalized_data: restoredData })
                    .eq('id', patch.id);

                if (!error) revertedCount++;
            }
        }

        sparkSessions.delete(sessionId);

        console.log(`[Spark] Reverted ${revertedCount} changes from session: ${sessionId}`);

        return NextResponse.json({
            success: true,
            data: {
                revertedCount,
                summary: `Reverted ${revertedCount} changes`,
            },
        });
    } catch (error) {
        console.error('DELETE /api/draft-orders/[id]/spark error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
