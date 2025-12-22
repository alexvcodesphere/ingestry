/**
 * Draft Orders API Routes
 * GET: List all draft orders
 * POST: Create a new draft order (triggers processing pipeline)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDraftOrders } from '@/lib/services/draft-order.service';
import { processOrder } from '@/lib/modules/processing/pipeline';
import { extractWithGPT } from '@/lib/gpt/extraction-client';
import { getPromptForProfile } from '@/lib/gpt/prompt-builder';
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
        const shopSystem = formData.get('shop_system') as ShopSystem;
        const brandId = formData.get('brand_id') as string | null;
        const profileId = formData.get('profile_id') as string | null;

        // Validate required fields
        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No file provided' },
                { status: 400 }
            );
        }
        if (!shopSystem) {
            return NextResponse.json(
                { success: false, error: 'Shop system is required' },
                { status: 400 }
            );
        }

        // Brand is no longer fetched separately - it's handled via code_lookups during normalization
        const brand = undefined;

        // Create a job record first
        const { data: job, error: jobError } = await supabase
            .from('jobs')
            .insert({
                type: 'pdf_extraction',
                status: 'processing',
                input: {
                    fileName: file.name,
                    fileSize: file.size,
                    shopSystem,
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

        // Get processing profile
        const { prompt: systemPrompt, profile } = await getPromptForProfile(profileId || undefined);
        console.log(`[API] Profile: ${profile?.name || 'fallback'}`);
        console.log(`[API] Profile fields: ${profile?.fields?.map((f: { key: string }) => f.key).join(', ') || 'default'}`);
        console.log(`[API] SKU template: ${profile?.sku_template || 'default'}`);
        console.log(`[API] Prompt preview: ${systemPrompt.substring(0, 200)}...`);

        // Extract products using GPT Vision
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        let rawProducts: RawExtractedProduct[];

        try {
            const extraction = await extractWithGPT(fileBuffer, systemPrompt);
            rawProducts = extraction.products;

            // Update job with result count
            await supabase
                .from('jobs')
                .update({
                    result: { productCount: rawProducts.length },
                })
                .eq('id', job.id);
        } catch (extractionError) {
            await supabase
                .from('jobs')
                .update({
                    status: 'failed',
                    error: extractionError instanceof Error ? extractionError.message : 'Extraction failed',
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
                options: {
                    auto_generate_sku: true,
                    normalize_colors: true,
                    match_catalogue: false,
                },
            }, profile);

            // Update job as completed
            await supabase
                .from('jobs')
                .update({
                    status: 'completed',
                    result: {
                        productCount: rawProducts.length,
                        draftOrderId: draftOrder.id,
                    },
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
