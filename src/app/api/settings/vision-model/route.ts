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
 * Get the current AI settings for the tenant (vision model and reasoning toggle)
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
        const aiReasoningEnabled = tenant?.settings?.ai_reasoning_enabled ?? true;

        return NextResponse.json({
            success: true,
            data: { 
                vision_model: visionModel,
                ai_reasoning_enabled: aiReasoningEnabled,
            },
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
 * Update AI settings for the tenant (vision model and/or reasoning toggle)
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
        const { vision_model, ai_reasoning_enabled } = body;

        // Validate vision_model if provided
        if (vision_model !== undefined && !VALID_MODELS.includes(vision_model)) {
            return NextResponse.json(
                { success: false, error: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}` },
                { status: 400 }
            );
        }

        // At least one setting must be provided
        if (vision_model === undefined && ai_reasoning_enabled === undefined) {
            return NextResponse.json(
                { success: false, error: 'At least one setting (vision_model or ai_reasoning_enabled) must be provided' },
                { status: 400 }
            );
        }

        // Get current tenant settings
        const { data: tenant, error: fetchError } = await supabase
            .from('tenants')
            .select('id, settings')
            .single();

        console.log(`[AI Settings API] Fetched tenant:`, JSON.stringify(tenant));

        if (fetchError || !tenant) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch tenant' },
                { status: 500 }
            );
        }

        // Merge new settings with existing settings
        const updatedSettings = {
            ...(tenant.settings || {}),
            ...(vision_model !== undefined && { vision_model }),
            ...(ai_reasoning_enabled !== undefined && { ai_reasoning_enabled }),
        };

        console.log(`[AI Settings API] Updating settings to:`, JSON.stringify(updatedSettings));

        const { error: updateError } = await supabase
            .from('tenants')
            .update({ settings: updatedSettings })
            .eq('id', tenant.id);

        if (updateError) {
            return NextResponse.json(
                { success: false, error: 'Failed to update settings' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: { 
                vision_model: updatedSettings.vision_model,
                ai_reasoning_enabled: updatedSettings.ai_reasoning_enabled ?? false,
            },
        });
    } catch (error) {
        console.error('PUT /api/settings/vision-model error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
