/**
 * Draft Orders API Routes
 * GET: List all draft orders
 * POST: Create a new draft order (triggers processing pipeline)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDraftOrders } from '@/lib/services/draft-order.service';
import { processOrder } from '@/lib/modules/processing/pipeline';
import { extractProducts, getPromptForProfile, type VisionModel, type ExtractedProductWithMeta } from '@/lib/extraction';
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
