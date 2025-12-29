import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentTenantId } from '@/lib/services/tenant.service';

export async function DELETE() {
    try {
        const supabase = await createClient();
        
        // 1. Verify Authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // 2. Verify Tenant Membership
        const tenantId = await getCurrentTenantId();
        if (!tenantId) {
            return NextResponse.json(
                { success: false, error: 'Tenant not found' },
                { status: 404 }
            );
        }

        // 3. Perform Deletion (Scoped to Tenant via RLS or explicit filter)
        // Since we are using the service role client inside backend logic usually, 
        // but here we used `createClient()` which is user-scoped. 
        // RLS policies on `draft_orders` and `jobs` are "Tenant Isolation".
        // So a simple `delete().neq('id', '0000...')` (delete all) works safely.

        // Delete Draft Orders (cascades to line items)
        const { error: ordersError } = await supabase
            .from('draft_orders')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows visible to this user
        
        if (ordersError) {
            console.error('Failed to clear orders:', ordersError);
            throw ordersError;
        }

        // Delete Jobs
        const { error: jobsError } = await supabase
            .from('jobs')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows visible to this user

        if (jobsError) {
            console.error('Failed to clear jobs:', jobsError);
            throw jobsError;
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Reset tenant data error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
