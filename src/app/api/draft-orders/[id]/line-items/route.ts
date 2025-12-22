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
import { generateSkuFromTemplate, type TemplateContext } from '@/lib/services/template-engine';
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

        // Verify ownership
        const order = await getDraftOrder(orderId);
        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }
        if (order.user_id !== user.id) {
            return NextResponse.json(
                { success: false, error: 'Forbidden' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { lineItemId, lineItemIds, updates } = body as {
            lineItemId?: string;
            lineItemIds?: string[];
            updates: Partial<NormalizedProduct>;
        };

        // Handle bulk update
        if (lineItemIds && lineItemIds.length > 0 && updates) {
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

        // Verify ownership
        const order = await getDraftOrder(orderId);
        if (!order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }
        if (order.user_id !== user.id) {
            return NextResponse.json(
                { success: false, error: 'Forbidden' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { action, lineItemIds } = body as {
            action: 'approve' | 'approve_all' | 'regenerate_sku';
            lineItemIds?: string[];
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

        // Handle SKU regeneration
        if (action === 'regenerate_sku' && lineItemIds?.length) {
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

            let regeneratedCount = 0;
            for (const item of items) {
                const data = item.normalized_data as NormalizedProduct;
                if (!data) continue;

                // Build template context
                const context: TemplateContext = {
                    brand: data.brand,
                    category: data.category,
                    colour: data.color_normalized || data.color,
                    gender: data.gender,
                    season: data.season,
                    size: data.size_normalized || data.size,
                    ean: data.ean,
                    sequence: item.line_number || 1,
                };

                // Generate new SKU
                const newSku = await generateSkuFromTemplate(context);

                // Update the line item
                const updated = await updateLineItem(item.id, { sku: newSku });
                if (updated) regeneratedCount++;
            }

            return NextResponse.json({
                success: true,
                data: { regeneratedCount },
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
