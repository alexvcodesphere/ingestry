/**
 * Draft Order Service
 * CRUD operations for draft orders and line items.
 */

import { createClient } from '@/lib/supabase/server';
import type {
    DraftOrder,
    DraftLineItem,
    DraftOrderStatus,
    NormalizedProduct,
    ShopSystem,
} from '@/types';
import { getAdapter } from '@/lib/adapters';

/**
 * Get a draft order by ID with all line items
 */
export async function getDraftOrder(orderId: string): Promise<DraftOrder | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('draft_orders')
        .select(`
            *,
            line_items:draft_line_items(*),
            brand:suppliers(*)
        `)
        .eq('id', orderId)
        .single();

    if (error || !data) {
        console.error('Failed to fetch draft order:', error);
        return null;
    }

    return data as DraftOrder;
}

/**
 * Get all draft orders for a user
 */
export async function getDraftOrders(options?: {
    status?: DraftOrderStatus;
    limit?: number;
    offset?: number;
}): Promise<{ orders: DraftOrder[]; total: number }> {
    const supabase = await createClient();

    let query = supabase
        .from('draft_orders')
        .select(`
            *,
            brand:suppliers(brand_name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

    if (options?.status) {
        query = query.eq('status', options.status);
    }
    if (options?.limit) {
        query = query.limit(options.limit);
    }
    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
        console.error('Failed to fetch draft orders:', error);
        return { orders: [], total: 0 };
    }

    return { orders: data as DraftOrder[], total: count || 0 };
}

/**
 * Update a draft order's status
 */
export async function updateDraftOrderStatus(
    orderId: string,
    status: DraftOrderStatus
): Promise<DraftOrder | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('draft_orders')
        .update({ status })
        .eq('id', orderId)
        .select()
        .single();

    if (error) {
        console.error('Failed to update draft order status:', error);
        return null;
    }

    return data as DraftOrder;
}

/**
 * Update a line item's normalized data
 */
export async function updateLineItem(
    lineItemId: string,
    updates: Partial<NormalizedProduct>
): Promise<DraftLineItem | null> {
    const supabase = await createClient();

    // Get current line item
    const { data: current, error: fetchError } = await supabase
        .from('draft_line_items')
        .select('normalized_data')
        .eq('id', lineItemId)
        .single();

    if (fetchError || !current) {
        console.error('Failed to fetch line item:', fetchError);
        return null;
    }

    // Merge updates
    const normalized = {
        ...(current.normalized_data as NormalizedProduct),
        ...updates,
    };

    // Update the item
    const { data, error } = await supabase
        .from('draft_line_items')
        .update({
            normalized_data: normalized,
            user_modified: true,
            status: 'validated', // Mark as validated after user edit
            validation_errors: [], // Clear errors after edit
        })
        .eq('id', lineItemId)
        .select()
        .single();

    if (error) {
        console.error('Failed to update line item:', error);
        return null;
    }

    return data as DraftLineItem;
}

/**
 * Approve line items
 */
export async function approveLineItems(
    lineItemIds: string[]
): Promise<{ success: boolean; count: number }> {
    const supabase = await createClient();

    const { error, count } = await supabase
        .from('draft_line_items')
        .update({ status: 'approved' })
        .in('id', lineItemIds);

    if (error) {
        console.error('Failed to approve line items:', error);
        return { success: false, count: 0 };
    }

    return { success: true, count: count || lineItemIds.length };
}

/**
 * Approve all line items in an order
 */
export async function approveAllLineItems(
    orderId: string
): Promise<{ success: boolean; count: number }> {
    const supabase = await createClient();

    const { error, count } = await supabase
        .from('draft_line_items')
        .update({ status: 'approved' })
        .eq('draft_order_id', orderId);

    if (error) {
        console.error('Failed to approve all line items:', error);
        return { success: false, count: 0 };
    }

    // Update order status to approved
    await updateDraftOrderStatus(orderId, 'approved');

    return { success: true, count: count || 0 };
}

/**
 * Submit an approved order to the shop system
 */
export async function submitOrderToShop(
    orderId: string
): Promise<{ success: boolean; results?: unknown; error?: string }> {
    const supabase = await createClient();

    // Get the order with line items
    const order = await getDraftOrder(orderId);
    if (!order) {
        return { success: false, error: 'Order not found' };
    }

    if (order.status !== 'approved') {
        return { success: false, error: 'Order must be approved before submitting' };
    }

    // Update status to exporting
    await updateDraftOrderStatus(orderId, 'exporting');

    try {
        // Get approved line items
        const approvedItems = order.line_items?.filter(i => i.status === 'approved') || [];
        const products = approvedItems.map(i => i.normalized_data as NormalizedProduct);

        if (products.length === 0) {
            return { success: false, error: 'No approved products to export' };
        }

        // Get the adapter for this shop system
        const adapter = getAdapter(order.shop_system as ShopSystem);

        // Upload products
        const results = await adapter.uploadProducts(products);

        // Update order with results
        await supabase
            .from('draft_orders')
            .update({
                status: results.failed === 0 ? 'exported' : 'failed',
                metadata: {
                    ...order.metadata,
                    export_results: results,
                },
            })
            .eq('id', orderId);

        return { success: results.failed === 0, results };
    } catch (error) {
        // Mark as failed
        await updateDraftOrderStatus(orderId, 'failed');
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Delete a draft order and all its line items
 */
export async function deleteDraftOrder(orderId: string): Promise<boolean> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('draft_orders')
        .delete()
        .eq('id', orderId);

    if (error) {
        console.error('Failed to delete draft order:', error);
        return false;
    }

    return true;
}

/**
 * Get line item counts by status for an order
 */
export async function getLineItemStats(orderId: string): Promise<{
    total: number;
    pending: number;
    validated: number;
    error: number;
    approved: number;
}> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('draft_line_items')
        .select('status')
        .eq('draft_order_id', orderId);

    if (error || !data) {
        return { total: 0, pending: 0, validated: 0, error: 0, approved: 0 };
    }

    return {
        total: data.length,
        pending: data.filter(i => i.status === 'pending').length,
        validated: data.filter(i => i.status === 'validated').length,
        error: data.filter(i => i.status === 'error').length,
        approved: data.filter(i => i.status === 'approved').length,
    };
}
