/**
 * Processing Pipeline Orchestrator
 * Connects GPT parsing output → Normalizer → Enricher → Draft Order creation.
 * This is the main entry point for processing uploaded files.
 */

import type {
    RawExtractedProduct,
    NormalizedProduct,
    ProcessingContext,
    DraftOrder,
    DraftLineItem,
    LineItemStatus,
    ValidationError,
} from '@/types';
import type { ProcessingProfile } from '@/lib/gpt/prompt-builder';
import { normalizeProducts } from './normalizer';
import { enrichProducts, validateProduct } from './enricher';
import { createClient } from '@/lib/supabase/server';

/**
 * Process raw GPT extraction results through the full pipeline
 * @param rawProducts Products extracted by GPT Vision
 * @param context Processing context (shop system, template, brand, etc.)
 * @param profile Optional processing profile for normalization and SKU generation
 * @returns Created draft order with line items
 */
export async function processOrder(
    rawProducts: RawExtractedProduct[],
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<DraftOrder> {
    console.log(`[Pipeline] Processing ${rawProducts.length} products`);
    console.log(`[Pipeline] Context: shop=${context.shop_system}, brand=${context.brand_name || 'none'}`);
    if (profile) {
        console.log(`[Pipeline] Using profile: ${profile.name}`);
    }

    // Step 1: Normalize products (using profile for field normalization)
    console.log('[Pipeline] Step 1: Normalizing products...');
    let normalized: NormalizedProduct[];
    try {
        normalized = await normalizeProducts(rawProducts, context, profile);
        console.log(`[Pipeline] Normalized ${normalized.length} products`);
    } catch (normalizeError) {
        console.error('[Pipeline] Normalization failed:', normalizeError);
        throw normalizeError;
    }

    // Step 2: Enrich with categories (skip if using a profile - profile defines the fields)
    let finalProducts = normalized;
    if (!profile) {
        console.log('[Pipeline] Step 2: Enriching with categories...');
        finalProducts = enrichProducts(normalized, context.template);
        console.log('[Pipeline] Enrichment complete');
    } else {
        console.log('[Pipeline] Step 2: Skipping enrichment (using profile fields)');
    }

    // Step 3: Create draft order with line items
    console.log('[Pipeline] Step 3: Creating draft order...');
    const draftOrder = await createDraftOrder(rawProducts, finalProducts, context, profile);
    console.log(`[Pipeline] Draft order created: ${draftOrder.id}`);

    return draftOrder;
}

/**
 * Create a draft order in the database with all line items
 */
async function createDraftOrder(
    rawProducts: RawExtractedProduct[],
    normalizedProducts: NormalizedProduct[],
    context: ProcessingContext,
    profile?: ProcessingProfile | null
): Promise<DraftOrder> {
    const supabase = await createClient();

    // Get tenant_id for the current user
    const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

    if (!tenantId) {
        throw new Error('Failed to determine tenant for draft order');
    }

    // Create the draft order
    const { data: order, error: orderError } = await supabase
        .from('draft_orders')
        .insert({
            tenant_id: tenantId,
            status: 'pending_review',
            shop_system: context.shop_system,
            template_id: context.template?.id || null,
            source_job_id: context.source_job_id || null,
            user_id: context.user_id,
            metadata: {
                options: context.options,
                product_count: normalizedProducts.length,
                profile_id: profile?.id || null,
                profile_name: profile?.name || null,
            },
        })
        .select()
        .single();

    if (orderError || !order) {
        throw new Error(`Failed to create draft order: ${orderError?.message || 'Unknown error'}`);
    }

    // Create line items
    const lineItems: Array<Omit<DraftLineItem, 'id' | 'created_at' | 'updated_at'>> = [];

    for (let i = 0; i < normalizedProducts.length; i++) {
        const raw = rawProducts[i];
        const normalized = normalizedProducts[i];
        const validationErrors = validateProduct(normalized).map(msg => ({
            field: getErrorField(msg),
            message: msg,
            severity: 'error' as const,
        }));

        const status: LineItemStatus = validationErrors.length > 0 ? 'error' : 'validated';

        lineItems.push({
            draft_order_id: order.id,
            line_number: i + 1,
            status,
            raw_data: raw,
            normalized_data: normalized,
            validation_errors: validationErrors,
            user_modified: false,
        });
    }

    // Batch insert line items
    const { error: itemsError } = await supabase
        .from('draft_line_items')
        .insert(lineItems);

    if (itemsError) {
        // Rollback the order if items fail
        await supabase.from('draft_orders').delete().eq('id', order.id);
        throw new Error(`Failed to create line items: ${itemsError.message}`);
    }

    // Fetch the complete order with items
    const { data: completeOrder, error: fetchError } = await supabase
        .from('draft_orders')
        .select(`
            *,
            line_items:draft_line_items(*)
        `)
        .eq('id', order.id)
        .single();

    if (fetchError || !completeOrder) {
        throw new Error(`Failed to fetch complete order: ${fetchError?.message || 'Unknown error'}`);
    }

    return completeOrder as DraftOrder;
}

/**
 * Get the field name from a validation error message
 */
function getErrorField(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes('sku')) return 'sku';
    if (lower.includes('name')) return 'name';
    if (lower.includes('price')) return 'price';
    if (lower.includes('quantity')) return 'quantity';
    return 'general';
}

/**
 * Re-process a single line item (after user edit)
 */
export async function reprocessLineItem(
    lineItemId: string,
    updatedData: Partial<NormalizedProduct>,
    context: ProcessingContext
): Promise<DraftLineItem> {
    const supabase = await createClient();

    // Get current line item
    const { data: item, error: fetchError } = await supabase
        .from('draft_line_items')
        .select('*')
        .eq('id', lineItemId)
        .single();

    if (fetchError || !item) {
        throw new Error(`Line item not found: ${lineItemId}`);
    }

    // Merge updates with existing normalized data
    const merged: NormalizedProduct = {
        ...(item.normalized_data as NormalizedProduct),
        ...updatedData,
    };

    // Re-enrich the product
    const enriched = enrichProducts([merged], context.template)[0];

    // Re-validate
    const validationErrors: ValidationError[] = validateProduct(enriched).map(msg => ({
        field: getErrorField(msg),
        message: msg,
        severity: 'error' as const,
    }));

    const status: LineItemStatus = validationErrors.length > 0 ? 'error' : 'validated';

    // Update the line item
    const { data: updated, error: updateError } = await supabase
        .from('draft_line_items')
        .update({
            normalized_data: enriched,
            validation_errors: validationErrors,
            status,
            user_modified: true,
        })
        .eq('id', lineItemId)
        .select()
        .single();

    if (updateError || !updated) {
        throw new Error(`Failed to update line item: ${updateError?.message || 'Unknown error'}`);
    }

    return updated as DraftLineItem;
}

/**
 * Approve multiple line items
 */
export async function approveLineItems(lineItemIds: string[]): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('draft_line_items')
        .update({ status: 'approved' })
        .in('id', lineItemIds);

    if (error) {
        throw new Error(`Failed to approve line items: ${error.message}`);
    }
}

/**
 * Check if all items in an order are approved
 */
export async function checkOrderApprovalStatus(orderId: string): Promise<{
    allApproved: boolean;
    counts: { pending: number; validated: number; error: number; approved: number };
}> {
    const supabase = await createClient();

    const { data: items, error } = await supabase
        .from('draft_line_items')
        .select('status')
        .eq('draft_order_id', orderId);

    if (error || !items) {
        throw new Error(`Failed to check approval status: ${error?.message || 'Unknown error'}`);
    }

    const counts = {
        pending: items.filter(i => i.status === 'pending').length,
        validated: items.filter(i => i.status === 'validated').length,
        error: items.filter(i => i.status === 'error').length,
        approved: items.filter(i => i.status === 'approved').length,
    };

    const allApproved = items.every(i => i.status === 'approved');

    return { allApproved, counts };
}

// Export individual modules for direct use
export { normalizeProducts, normalizeProduct } from './normalizer';
export { enrichProducts, enrichProduct, validateProduct } from './enricher';
