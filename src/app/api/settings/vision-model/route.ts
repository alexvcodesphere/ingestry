/**
 * Vision Model Settings API
 * GET: Get current vision model setting
 * PUT: Update vision model setting
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { VisionModel } from '@/lib/extraction';

const VALID_MODELS: VisionModel[] = ['gpt-4o', 'gemini-3-flash', 'gemini-3-pro'];

/**
 * GET /api/settings/vision-model
 * Get the current vision model setting for the tenant
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('settings')
            .single();

        if (tenantError) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch tenant settings' },
                { status: 500 }
            );
        }

        const visionModel = tenant?.settings?.vision_model || 'gpt-4o';

        return NextResponse.json({
            success: true,
            data: { vision_model: visionModel },
        });
    } catch (error) {
        console.error('GET /api/settings/vision-model error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/settings/vision-model
 * Update the vision model setting for the tenant
 */
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { vision_model } = body;

        if (!vision_model || !VALID_MODELS.includes(vision_model)) {
            return NextResponse.json(
                { success: false, error: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}` },
                { status: 400 }
            );
        }

        // Get current tenant settings
        const { data: tenant, error: fetchError } = await supabase
            .from('tenants')
            .select('id, settings')
            .single();

        console.log(`[Vision API] Fetched tenant:`, JSON.stringify(tenant));
        console.log(`[Vision API] Fetch error:`, fetchError?.message || 'none');

        if (fetchError || !tenant) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch tenant' },
                { status: 500 }
            );
        }

        // Merge new setting with existing settings
        const updatedSettings = {
            ...(tenant.settings || {}),
            vision_model,
        };

        console.log(`[Vision API] Updating settings to:`, JSON.stringify(updatedSettings));

        const { error: updateError } = await supabase
            .from('tenants')
            .update({ settings: updatedSettings })
            .eq('id', tenant.id);

        console.log(`[Vision API] Update error:`, updateError?.message || 'none');

        if (updateError) {
            return NextResponse.json(
                { success: false, error: 'Failed to update settings' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: { vision_model },
        });
    } catch (error) {
        console.error('PUT /api/settings/vision-model error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
