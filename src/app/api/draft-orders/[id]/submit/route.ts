/**
 * Draft Order Submit API Route
 * POST: Submit an approved order to the shop system
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDraftOrder, submitOrderToShop } from '@/lib/services/draft-order.service';

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/draft-orders/[id]/submit
 * Submit the order to the configured shop system
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

        // Check order status
        if (order.status !== 'approved') {
            return NextResponse.json(
                { success: false, error: 'Order must be fully approved before submitting' },
                { status: 400 }
            );
        }

        // Submit to shop
        const result = await submitOrderToShop(orderId);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                message: 'Order submitted successfully',
                results: result.results,
            },
        });
    } catch (error) {
        console.error('POST /api/draft-orders/[id]/submit error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
