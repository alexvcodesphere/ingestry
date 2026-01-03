/**
 * Tenant Service
 * Handles multi-tenant context for the application.
 * One user = one tenant model.
 */

import { createClient } from '@/lib/supabase/server';
import type { TenantUserProfile } from '@/types';

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

/** Field definition for the unified field system */
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
 * Get all field definitions for the current tenant
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
 * Get all members of the current tenant with their profile info
 */
export async function getTenantMembers(): Promise<TenantUserProfile[]> {
    const supabase = await createClient();
    const tenantId = await getCurrentTenantId();

    if (!tenantId) return [];

    const { data, error } = await supabase
        .from('tenant_user_profiles')
        .select('*')
        .eq('tenant_id', tenantId);

    if (error || !data) {
        console.error('Failed to fetch tenant members:', error);
        return [];
    }

    return data as TenantUserProfile[];
}
