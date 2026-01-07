/**
 * Draft Orders API Routes
 * GET: List all draft orders
 * POST: Create a new draft order (triggers processing pipeline)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDraftOrders } from '@/lib/services/draft-order.service';
import { processOrder } from '@/lib/modules/processing/pipeline';
import { extractProducts, getPromptForProfile, type VisionModel, type ExtractedProductWithMeta, type ExtractionFieldConfig } from '@/lib/extraction';
import { evaluateTemplate, loadCodeLookups, loadExtraDataLookups, type TemplateContext } from '@/lib/services/template-engine';
import { enrichProducts, type EnrichmentField } from '@/lib/services/ai-enrichment';
import type { DraftOrderStatus, ShopSystem, RawExtractedProduct } from '@/types';

/**
 * GET /api/draft-orders
 * List all draft orders for the current user
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const status = searchParams.get('status') as DraftOrderStatus | null;
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const { orders, total } = await getDraftOrders({
            status: status || undefined,
            limit,
            offset,
        });

        return NextResponse.json({
            success: true,
            data: orders,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + orders.length < total,
            },
        });
    } catch (error) {
        console.error('GET /api/draft-orders error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/draft-orders
 * Create a new draft order by processing an uploaded file
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const shopSystemForm = formData.get('shop_system') as ShopSystem | null;
        const brandId = formData.get('brand_id') as string | null;
        const profileId = formData.get('profile_id') as string | null;
        const orderName = formData.get('order_name') as string | null;
        const skipComputed = formData.get('skip_computed') === 'true';

        // Validate required fields
        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No file provided' },
                { status: 400 }
            );
        }
        // shop_system is now optional - will be derived from profile if not provided

        // Brand is handled via code_lookups during normalization, not fetched separately

        // Create a job record first
        const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
                type: 'pdf_extraction',
                status: 'processing',
                input: {
                    fileName: file.name,
                    fileSize: file.size,
                    orderName: orderName || file.name.replace(/\.[^/.]+$/, ''),
                    shopSystem: shopSystemForm,
                    brandId,
                    profileId,
                },
                user_id: user.id,
            })
            .select()
            .single();

        if (jobError) {
            return NextResponse.json(
                { success: false, error: 'Failed to create job' },
                { status: 500 }
            );
        }

        // Get tenant's AI settings
        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .select('settings')
            .single();
        
        console.log(`[API] Tenant data:`, JSON.stringify(tenantData));
        console.log(`[API] Tenant error:`, tenantError?.message || 'none');
        
        const visionModel = (tenantData?.settings?.vision_model as VisionModel) || 'gpt-4o';
        const aiReasoningEnabled = tenantData?.settings?.ai_reasoning_enabled ?? true;
        console.log(`[API] Vision model: ${visionModel}`);
        console.log(`[API] AI Reasoning Enabled: ${aiReasoningEnabled}`);

        // Get processing profile (required)
        const { prompt: systemPrompt, profile } = await getPromptForProfile(
            profileId || undefined,
            { enableReasoning: aiReasoningEnabled }
            // catalogGuide is added below after we know the profile fields
        );

        console.log(`[API] Prompt includes needs_checking instructions: ${systemPrompt.includes('needs_checking')}`);

        if (!profile) {
            return NextResponse.json(
                { success: false, error: 'Processing profile is required. Please create a profile in Settings → Processing.' },
                { status: 400 }
            );
        }

        console.log(`[API] Profile: ${profile.name}`);
        console.log(`[API] Profile fields: ${profile.fields?.map((f: { key: string }) => f.key).join(', ')}`);

        // API Decoupling: Derive shop_system from profile if not provided
        const defaultExportConfig = (profile as { export_configs?: Array<{ shop_system: ShopSystem }>, default_export_config_idx?: number }).export_configs?.[
            (profile as { default_export_config_idx?: number }).default_export_config_idx ?? 0
        ];
        const shopSystem: ShopSystem = shopSystemForm || defaultExportConfig?.shop_system || 'xentral';
        console.log(`[API] Shop system: ${shopSystem} (from: ${shopSystemForm ? 'form' : 'profile'})`);


        // Pre-fetch catalog data for semantic matching (single DB query)
        const catalogKeys = profile.fields
            ?.filter((f: { catalog_key?: string }) => f.catalog_key)
            .map((f: { catalog_key?: string }) => f.catalog_key!) || [];
        
        let catalogGuide = '';
        if (catalogKeys.length > 0) {
            const { getCatalogMatchGuide } = await import('@/lib/services/catalog-reconciler');
            catalogGuide = await getCatalogMatchGuide(catalogKeys);
            console.log(`[API] Catalog guide generated for ${catalogKeys.length} keys`);
        }

        console.log(`[API] Prompt preview: ${systemPrompt.substring(0, 200)}...`);

        // Extract products using selected vision model
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let extractedProducts: ExtractedProductWithMeta[];
        let rawProducts: RawExtractedProduct[];

        try {
            const extraction = await extractProducts(fileBuffer, systemPrompt, visionModel);
            extractedProducts = extraction.products;
            
            // Log needs_checking data from AI response
            const productsWithFlags = extractedProducts.filter(p => p.needs_checking && p.needs_checking.length > 0);
            console.log(`[API] Products with needs_checking flags: ${productsWithFlags.length}/${extractedProducts.length}`);
            if (productsWithFlags.length > 0) {
                console.log(`[API] needs_checking flags:`, JSON.stringify(productsWithFlags.map(p => p.needs_checking), null, 2));
            }
            
            // Extract raw data for processing, storing needs_checking in data for now
            rawProducts = extractedProducts.map(p => {
                const data = { ...p.data };
                // Store needs_checking as JSON string in the data if present
                if (p.needs_checking && p.needs_checking.length > 0) {
                    (data as Record<string, unknown>)._needs_checking = p.needs_checking;
                }
                return data;
            });

            // Update job with result count
            await supabase
                .from('jobs')
                .update({
                    result: { productCount: rawProducts.length },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);
        } catch (extractionError) {
            await supabase
                .from('jobs')
                .update({
                    status: 'failed',
                    error: extractionError instanceof Error ? extractionError.message : 'Extraction failed',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);

            return NextResponse.json(
                { success: false, error: 'PDF extraction failed' },
                { status: 500 }
            );
        }

        // Process through the pipeline
        try {
            const draftOrder = await processOrder(rawProducts, {
                shop_system: shopSystem,
                user_id: user.id,
                source_job_id: job.id,
                order_name: orderName || undefined,
                options: {
                    auto_generate_sku: true,
                    normalize_colors: true,
                    match_catalogue: false,
                },
            }, profile as Parameters<typeof processOrder>[2]);

            // --- AUTO-COMPUTE: Process computed fields unless skipped ---
            if (!skipComputed && draftOrder.line_items && draftOrder.line_items.length > 0) {
                const templatedFields = (profile.fields || []).filter(
                    (f: { source?: string; logic_type?: string; template?: string; use_template?: boolean }) =>
                        (f.source === 'computed' && f.logic_type === 'template' && f.template) ||
                        (f.use_template && f.template)
                );
                
                const aiEnrichmentFields = (profile.fields || []).filter(
                    (f: { source?: string; logic_type?: string; ai_prompt?: string }) =>
                        f.source === 'computed' && f.logic_type === 'ai_enrichment' && f.ai_prompt
                );

                if (templatedFields.length > 0 || aiEnrichmentFields.length > 0) {
                    console.log(`[API] Auto-computing ${templatedFields.length} template + ${aiEnrichmentFields.length} AI fields`);
                    
                    // Build lookup maps for templates
                    const codeLookups = await loadCodeLookups();
                    const extraDataLookups = await loadExtraDataLookups();
                    
                    const catalogKeyMapping: Record<string, string> = {};
                    for (const field of profile.fields || []) {
                        if ((field as { catalog_key?: string }).catalog_key) {
                            catalogKeyMapping[field.key] = (field as { catalog_key: string }).catalog_key;
                        }
                    }

                    // Process each line item
                    const batchUpdates: Array<{ id: string; normalized_data: Record<string, unknown> }> = [];
                    
                    for (const item of draftOrder.line_items) {
                        const data = item.normalized_data as Record<string, unknown>;
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
                        
                        // Process template fields
                        for (const field of templatedFields) {
                            try {
                                const newValue = await evaluateTemplate(field.template!, context, codeLookups, extraDataLookups);
                                updates[field.key] = newValue;
                            } catch (err) {
                                console.error(`[Auto-Compute] Template ${field.key} failed:`, err);
                            }
                        }

                        if (Object.keys(updates).length > 0) {
                            batchUpdates.push({
                                id: item.id,
                                normalized_data: { ...data, ...updates },
                            });
                        }
                    }

                    // Process AI enrichment fields (batch)
                    if (aiEnrichmentFields.length > 0 && process.env.GEMINI_API_KEY) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const enrichmentFieldsInput: EnrichmentField[] = (aiEnrichmentFields as any[]).map(
                            (f) => ({
                                key: f.key as string,
                                label: f.label as string,
                                ai_prompt: f.ai_prompt as string,
                                fallback: f.fallback as string | undefined,
                            })
                        );

                        const productsToEnrich = draftOrder.line_items.map(item => {
                            const existing = batchUpdates.find(u => u.id === item.id);
                            return {
                                id: item.id,
                                data: existing ? existing.normalized_data : (item.normalized_data as Record<string, unknown> || {}),
                            };
                        });

                        try {
                            const enrichmentResults = await enrichProducts(enrichmentFieldsInput, productsToEnrich, process.env.GEMINI_API_KEY);
                            
                            for (const result of enrichmentResults) {
                                const existingIdx = batchUpdates.findIndex(u => u.id === result.id);
                                if (existingIdx >= 0) {
                                    batchUpdates[existingIdx].normalized_data = {
                                        ...batchUpdates[existingIdx].normalized_data,
                                        ...result.enrichments,
                                    };
                                } else {
                                    const item = draftOrder.line_items.find(i => i.id === result.id);
                                    if (item) {
                                        batchUpdates.push({
                                            id: result.id,
                                            normalized_data: { ...(item.normalized_data as Record<string, unknown>), ...result.enrichments },
                                        });
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('[Auto-Compute] AI enrichment failed:', err);
                        }
                    }

                    // Save computed values
                    if (batchUpdates.length > 0) {
                        const updatePromises = batchUpdates.map(update =>
                            supabase
                                .from('draft_line_items')
                                .update({ normalized_data: update.normalized_data })
                                .eq('id', update.id)
                        );
                        await Promise.all(updatePromises);
                        console.log(`[API] Auto-computed ${batchUpdates.length} items`);
                    }
                }
            }

            // Update job as completed
            await supabase
                .from('jobs')
                .update({
                    status: 'completed',
                    result: {
                        productCount: rawProducts.length,
                        draftOrderId: draftOrder.id,
                    },
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);

            return NextResponse.json({
                success: true,
                data: {
                    orderId: draftOrder.id,
                    productCount: draftOrder.line_items?.length || 0,
                    status: draftOrder.status,
                },
            });
        } catch (pipelineError) {
            await supabase
                .from('jobs')
                .update({
                    status: 'failed',
                    error: pipelineError instanceof Error ? pipelineError.message : 'Pipeline failed',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id);

            return NextResponse.json(
                { success: false, error: 'Processing pipeline failed' },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('POST /api/draft-orders error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
