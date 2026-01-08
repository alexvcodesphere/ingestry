/**
 * Ingestry Spark API Route (AI SDK v6)
 * 
 * Native tool calling agent with streaming responses.
 * POST: Stream AI responses with tool execution
 * DELETE: Revert a previous Spark session
 */

import { NextRequest, NextResponse } from 'next/server';
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { createClient } from '@/lib/supabase/server';
import { sparkModel } from '@/lib/extraction/unified-ai-client';
import { 
    createPatchItemsSchema, 
    recalculateFieldsSchema, 
    queryOrderDataSchema,
    suggestCatalogAliasSchema,
    buildToolDescriptions,
    getCanonicalFieldKey,
    coerceFieldValue,
    type SparkFieldConfig,
    type PatchItemsResult,
    type RecalculateFieldsResult,
    type QueryOrderDataResult,
    type SuggestCatalogAliasResult,
} from '@/lib/extraction/spark-tools';
import { getDraftOrder } from '@/lib/services/draft-order.service';
import { getCatalogMatchGuide } from '@/lib/services/catalog-reconciler';
import { parseFieldValue } from '@/lib/modules/processing/normalizer';
import { regenerateTemplatesForLineItems } from '@/lib/services/regenerate-templates';

interface RouteParams {
    params: Promise<{ id: string }>;
}

interface ProfileField {
    key: string;
    label: string;
    catalog_key?: string;
    type?: 'string' | 'number' | 'boolean';
    source?: 'extracted' | 'computed';
    use_template?: boolean;
    template?: string;
}

// In-memory session storage for undo capability
// Production: use Redis or a dedicated DB table
interface UndoSession {
    patches: Array<{
        id: string;
        previous_data: Record<string, unknown>;
    }>;
    timestamp: number;
}
const sparkSessions = new Map<string, UndoSession>();

/**
 * Build the system prompt for Spark with profile context
 */
function buildSparkSystemPrompt(
    fields: SparkFieldConfig[],
    catalogGuide?: string
): string {
    const toolDescriptions = buildToolDescriptions(fields);
    const sourceFields = fields.filter(f => f.source !== 'computed');
    const computedFields = fields.filter(f => f.source === 'computed' || f.use_template);
    
    let prompt = `You are Ingestry Spark, an intelligent data assistant for managing product data in a retail workflow application.

## Your Capabilities
You can modify, analyze, and transform product data using the tools provided.

## Available Fields

### Source Fields (can be modified directly)
${sourceFields.map(f => `- ${f.key}: ${f.label}`).join('\n')}

### Computed Fields (regenerated from templates)
${computedFields.map(f => `- ${f.key}: ${f.label}${f.template ? ` (template: "${f.template}")` : ''}`).join('\n')}

## Tool Usage Guidelines

1. **patch_items**: ${toolDescriptions.patch_items}

2. **recalculate_fields**: ${toolDescriptions.recalculate_fields}

3. **query_order_data**: ${toolDescriptions.query_order_data}

4. **suggest_catalog_alias**: When you find values that don't match the catalog, suggest adding them as aliases to existing entries. IMPORTANT: Use EXACT field_key and canonical_name from the Catalog Reference below (e.g., catalog_key="Color" not "colors", suggested_canonical="Grey" exactly as shown).

## Important Rules
- For modifications, ALWAYS use patch_items - never just describe changes
- For computed field refreshes, use recalculate_fields
- You may chain tools: e.g., patch_items then recalculate_fields
- For questions about data, use query_order_data first
- Be precise about which items to target
- If a request is ambiguous, ask for clarification instead of guessing

## Sanity Check Guidelines
When asked to do a "sanity check" or review the data:
1. You already have the full data in context - analyze it directly without excessive tool calls
2. Focus on identifying values that don't match the catalog
3. Use suggest_catalog_alias for non-matching values that should be aliases
4. Report empty/missing fields concisely
5. Summarize issues briefly, then offer to fix them

## Efficiency Guidelines
- BATCH same-value updates: If multiple items need the same value, call patch_items ONCE with all item IDs
- For computed fields (SKU, descriptions, etc.), use recalculate_fields instead of individual patch_items
- Minimize tool calls - prefer analyzing the data you already have in context
- When using query_order_data, avoid making many individual calls - batch your analysis`;

    if (catalogGuide) {
        prompt += `

## Catalog Reference
For fields that match with catalog values, use ONLY these canonical names:
${catalogGuide}`;
    }

    return prompt;
}

/**
 * POST /api/draft-orders/[id]/spark
 * Stream AI responses with native tool calling
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
        const { messages, lineItemIds } = body as {
            messages: UIMessage[];
            lineItemIds?: string[];
        };

        if (!messages || messages.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Messages are required' },
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

        const profileFields = (profile?.fields || []) as ProfileField[];
        const sparkFields: SparkFieldConfig[] = profileFields.map(f => ({
            key: f.key,
            label: f.label,
            type: f.type,
            source: f.source,
            use_template: f.use_template,
            template: f.template,
        }));
        const fieldKeys: string[] = profileFields.map(f => f.key);
        const catalogKeys: string[] = profileFields.filter(f => f.catalog_key).map(f => f.catalog_key!);

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

        // Build items lookup for tools
        const itemsMap = new Map(items.map(i => [i.id, i.normalized_data as Record<string, unknown>]));
        const allItemIds = items.map(i => i.id);

        // Get catalog guide for context-aware corrections
        let catalogGuide: string | undefined;
        if (catalogKeys.length > 0) {
            catalogGuide = await getCatalogMatchGuide(catalogKeys);
        }

        const systemPrompt = buildSparkSystemPrompt(sparkFields, catalogGuide);

        // Inject current data context into the conversation
        const dataContext = `\n\n[Current Data: ${items.length} items]\n${JSON.stringify(
            items.map(i => ({ id: i.id, ...(i.normalized_data as object) })),
            null,
            0
        )}`;
        
        // Helper to extract text from UIMessage parts
        function getTextFromUIMessage(message: UIMessage): string {
            return message.parts
                .filter(part => part.type === 'text')
                .map(part => (part as { type: 'text'; text: string }).text)
                .join('');
        }
        
        // Append data context to the last user message
        const messagesWithContext = messages.map((m, idx) => {
            if (idx === messages.length - 1 && m.role === 'user') {
                const text = getTextFromUIMessage(m);
                return {
                    ...m,
                    parts: [{ type: 'text' as const, text: text + dataContext }],
                };
            }
            return m;
        });
        
        // Convert UIMessages to model messages
        const modelMessages = await convertToModelMessages(messagesWithContext);

        log('Starting streamText');

        const result = streamText({
            model: sparkModel,
            system: systemPrompt,
            messages: modelMessages,
            stopWhen: stepCountIs(5), // Allow multi-step tool chaining
            tools: {
                patch_items: tool({
                    description: 'Update specific fields on specific items. Returns full updated items for optimistic UI updates.',
                    inputSchema: createPatchItemsSchema(sparkFields),
                    execute: async ({ item_ids, field_key, value }): Promise<PatchItemsResult> => {
                        log(`Tool: patch_items - ${item_ids.length} items, ${field_key} = ${value}`);
                        
                        // Validate and canonicalize field key
                        const canonicalKey = getCanonicalFieldKey(field_key, sparkFields);
                        if (!canonicalKey) {
                            return {
                                success: false,
                                count: 0,
                                field: field_key,
                                value,
                                items: [],
                                sessionId: '',
                            };
                        }
                        
                        // Coerce value to correct type
                        const typedValue = coerceFieldValue(canonicalKey, value, sparkFields);
                        const parsedValue = parseFieldValue(canonicalKey, String(typedValue));
                        
                        // Determine target items
                        const targetIds = item_ids.length > 0 ? item_ids : allItemIds;
                        
                        // Capture previous state for undo
                        const sessionId = `${orderId}-${Date.now()}`;
                        const undoPatches: Array<{ id: string; previous_data: Record<string, unknown> }> = [];
                        const updatedItems: Array<{ id: string; data: Record<string, unknown> }> = [];
                        
                        for (const id of targetIds) {
                            const currentData = itemsMap.get(id);
                            if (!currentData) continue;
                            
                            // Capture previous value
                            undoPatches.push({
                                id,
                                previous_data: { [canonicalKey]: currentData[canonicalKey] },
                            });
                            
                            // Apply update
                            const updatedData = { ...currentData, [canonicalKey]: parsedValue };
                            
                            const { error: updateError } = await supabase
                                .from('draft_line_items')
                                .update({
                                    normalized_data: updatedData,
                                    user_modified: true,
                                    status: 'validated',
                                })
                                .eq('id', id);
                            
                            if (!updateError) {
                                itemsMap.set(id, updatedData);
                                updatedItems.push({ id, data: updatedData });
                            }
                        }
                        
                        // Store session for undo (30 minute TTL)
                        sparkSessions.set(sessionId, { patches: undoPatches, timestamp: Date.now() });
                        setTimeout(() => sparkSessions.delete(sessionId), 30 * 60 * 1000);
                        
                        log(`patch_items complete: ${updatedItems.length} items updated, session: ${sessionId}`);
                        
                        return {
                            success: true,
                            count: updatedItems.length,
                            field: canonicalKey,
                            value: parsedValue,
                            items: updatedItems,
                            sessionId,
                        };
                    },
                }),
                
                recalculate_fields: tool({
                    description: 'Trigger template engine to refresh computed fields.',
                    inputSchema: recalculateFieldsSchema,
                    execute: async ({ field_keys, item_ids }): Promise<RecalculateFieldsResult> => {
                        log(`Tool: recalculate_fields - fields: ${field_keys?.join(', ') || 'all'}, items: ${item_ids?.length || 'all'}`);
                        
                        const targetIds = item_ids?.length ? item_ids : allItemIds;
                        
                        // Call the regeneration service directly (avoids internal fetch issues on Codesphere)
                        const regenerateResult = await regenerateTemplatesForLineItems(
                            orderId,
                            targetIds,
                            field_keys?.length ? field_keys : undefined
                        );
                        
                        if (!regenerateResult.success) {
                            return {
                                success: false,
                                count: 0,
                                fields: [],
                                items: [],
                            };
                        }
                        
                        // Use items from the regeneration result if available
                        const updatedItems = regenerateResult.items || [];
                        
                        // Update local map
                        for (const item of updatedItems) {
                            itemsMap.set(item.id, item.data);
                        }
                        
                        log(`recalculate_fields complete: ${updatedItems.length} items`);
                        
                        return {
                            success: true,
                            count: updatedItems.length,
                            fields: regenerateResult.fieldsUpdated || field_keys || [],
                            items: updatedItems,
                        };
                    },
                }),
                
                query_order_data: tool({
                    description: 'Read-only access to analyze current data.',
                    inputSchema: queryOrderDataSchema,
                    execute: async ({ query_type, field_key, filter_value }): Promise<QueryOrderDataResult> => {
                        log(`Tool: query_order_data - type: ${query_type}, field: ${field_key}, filter: ${filter_value}`);
                        
                        const allItems = Array.from(itemsMap.entries()).map(([id, data]) => ({ id, ...data }));
                        
                        switch (query_type) {
                            case 'count': {
                                if (field_key && filter_value) {
                                    const count = allItems.filter(item => {
                                        const val = String((item as Record<string, unknown>)[field_key] || '').toLowerCase();
                                        return val.includes(filter_value.toLowerCase());
                                    }).length;
                                    return {
                                        type: 'count',
                                        field: field_key,
                                        result: count,
                                        summary: `Found ${count} items where ${field_key} contains "${filter_value}"`,
                                    };
                                }
                                return {
                                    type: 'count',
                                    result: allItems.length,
                                    summary: `Total: ${allItems.length} items`,
                                };
                            }
                            
                            case 'unique': {
                                if (!field_key) {
                                    return {
                                        type: 'unique',
                                        result: [],
                                        summary: 'Field key required for unique query',
                                    };
                                }
                                const uniqueValues = [...new Set(allItems.map(item => String((item as Record<string, unknown>)[field_key] || '')).filter(Boolean))];
                                return {
                                    type: 'unique',
                                    field: field_key,
                                    result: uniqueValues,
                                    summary: `Found ${uniqueValues.length} unique values for ${field_key}: ${uniqueValues.slice(0, 10).join(', ')}${uniqueValues.length > 10 ? '...' : ''}`,
                                };
                            }
                            
                            case 'filter': {
                                if (!field_key || !filter_value) {
                                    return {
                                        type: 'filter',
                                        result: [],
                                        summary: 'Field key and filter value required',
                                    };
                                }
                                const filtered = allItems.filter(item => {
                                    const val = String((item as Record<string, unknown>)[field_key] || '').toLowerCase();
                                    return val.includes(filter_value.toLowerCase());
                                });
                                return {
                                    type: 'filter',
                                    field: field_key,
                                    result: filtered,
                                    summary: `Found ${filtered.length} items matching "${filter_value}" in ${field_key}`,
                                };
                            }
                            
                            case 'list': {
                                const preview = allItems.slice(0, 5).map(item => 
                                    field_key ? { id: (item as Record<string, unknown>).id, [field_key]: (item as Record<string, unknown>)[field_key] } : item
                                );
                                return {
                                    type: 'list',
                                    field: field_key,
                                    result: preview,
                                    summary: `Showing ${preview.length} of ${allItems.length} items`,
                                };
                            }
                            
                            default:
                                return {
                                    type: query_type,
                                    result: null,
                                    summary: 'Unknown query type',
                                };
                        }
                    },
                }),
                
                suggest_catalog_alias: tool({
                    description: 'Suggest adding a new alias to a catalog entry. Use this when you find values that don\'t match the catalog but should map to an existing entry. Returns a suggestion for user review - does NOT automatically add the alias.',
                    inputSchema: suggestCatalogAliasSchema,
                    execute: async ({ catalog_key, value, suggested_canonical, reason }): Promise<SuggestCatalogAliasResult> => {
                        log(`Tool: suggest_catalog_alias - ${value} → ${suggested_canonical} in ${catalog_key}`);
                        
                        // This tool just returns the suggestion - actual implementation
                        // would require user confirmation via a separate flow
                        return {
                            success: true,
                            suggestion: {
                                catalog_key,
                                value,
                                suggested_canonical,
                                reason,
                            },
                            message: `Suggestion: Add "${value}" as an alias for "${suggested_canonical}" in the ${catalog_key} catalog. Reason: ${reason}`,
                        };
                    },
                }),
            },
        });

        log('Returning stream response');
        return result.toUIMessageStreamResponse();
        
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

        const session = sparkSessions.get(sessionId);
        if (!session) {
            return NextResponse.json(
                { success: false, error: 'Session expired or not found' },
                { status: 404 }
            );
        }

        // Revert each patch
        let revertedCount = 0;
        const revertedItems: Array<{ id: string; data: Record<string, unknown> }> = [];
        
        for (const patch of session.patches) {
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

                if (!error) {
                    revertedCount++;
                    revertedItems.push({ id: patch.id, data: restoredData });
                }
            }
        }

        sparkSessions.delete(sessionId);

        console.log(`[Spark] Reverted ${revertedCount} changes from session: ${sessionId}`);

        return NextResponse.json({
            success: true,
            data: {
                revertedCount,
                items: revertedItems,
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
