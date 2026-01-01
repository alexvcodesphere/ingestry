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

        // Clear Storage Buckets (pdfs, catalogues)
        // We attempt this but don't fail the whole request if it errors (e.g. buckets don't exist)
        try {
            const buckets = ['pdfs', 'catalogues'];
            for (const bucket of buckets) {
                const { data: files, error: listError } = await supabase.storage.from(bucket).list();
                if (listError) {
                    console.warn(`Failed to list files in bucket ${bucket}:`, listError);
                    continue;
                }

                if (files && files.length > 0) {
                    const paths = files.map(f => f.name);
                    const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
                    if (removeError) {
                        console.warn(`Failed to remove files from bucket ${bucket}:`, removeError);
                    }
                }
            }
        } catch (storageError) {
            console.error('Storage cleanup error:', storageError);
            // Continue - database is already cleared
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
