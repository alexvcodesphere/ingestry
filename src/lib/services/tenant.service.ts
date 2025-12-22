/**
 * Tenant Service
 * Handles multi-tenant context for the application.
 * One user = one tenant model.
 */

import { createClient } from '@/lib/supabase/server';

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    created_at: string;
}

export interface TenantMember {
    id: string;
    tenant_id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member';
}

export interface LookupType {
    id: string;
    tenant_id: string;
    slug: string;
    label: string;
    description?: string;
    is_system: boolean;
    variable_name?: string;
    sort_order: number;
}

/** New unified field definition (replaces lookup_types) */
export interface FieldDefinition {
    id: string;
    tenant_id: string;
    key: string;
    label: string;
    source: 'extracted' | 'computed';
    has_code_lookup: boolean;
    template?: string;
    description?: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

/**
 * Get the current user's tenant ID
 * Returns null if user is not a member of any tenant
 */
export async function getCurrentTenantId(): Promise<string | null> {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership, error } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();

    if (error || !membership) {
        console.warn('User has no tenant membership:', user.id);
        return null;
    }

    return membership.tenant_id;
}

/**
 * Get the current user's tenant with full details
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return null;

    const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

    if (error || !data) return null;
    return data as Tenant;
}

/**
 * Get all lookup types for the current tenant
 */
export async function getLookupTypes(): Promise<LookupType[]> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return [];

    const { data, error } = await supabase
        .from('lookup_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order');

    if (error || !data) return [];
    return data as LookupType[];
}

/**
 * Get all field definitions for the current tenant (new unified system)
 */
export async function getFieldDefinitions(): Promise<FieldDefinition[]> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return [];

    const { data, error } = await supabase
        .from('field_definitions')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('sort_order');

    if (error || !data) return [];
    return data as FieldDefinition[];
}

/**
 * Create a new custom lookup type
 */
export async function createLookupType(input: {
    slug: string;
    label: string;
    description?: string;
    variable_name?: string;
}): Promise<LookupType | null> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return null;

    // Get max sort_order
    const { data: existing } = await supabase
        .from('lookup_types')
        .select('sort_order')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: false })
        .limit(1);

    const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

    const { data, error } = await supabase
        .from('lookup_types')
        .insert({
            tenant_id: tenantId,
            slug: input.slug.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            label: input.label,
            description: input.description,
            variable_name: input.variable_name || input.slug.toLowerCase(),
            is_system: false,
            sort_order: nextOrder,
        })
        .select()
        .single();

    if (error) {
        console.error('Failed to create lookup type:', error);
        return null;
    }

    return data as LookupType;
}

/**
 * Delete a custom lookup type (not system types)
 */
export async function deleteLookupType(id: string): Promise<boolean> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return false;

    const { error } = await supabase
        .from('lookup_types')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('is_system', false); // Can't delete system types

    return !error;
}

/**
 * Seed default lookup types for a new tenant
 * NOTE: No default types are seeded - users create all lookup types themselves.
 * This supports productization where each tenant has their own custom setup.
 */
export async function seedLookupTypesForTenant(_tenantId: string): Promise<void> {
    // No default lookup types - users create their own
    // This function is kept for backwards compatibility but does nothing
}

