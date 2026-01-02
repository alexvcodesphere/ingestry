/**
 * AI Model Settings API
 * GET: Get current AI model settings (vision + spark)
 * PUT: Update AI model settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { type VisionModel, type SparkModel, VISION_MODELS, SPARK_MODELS, DEFAULT_VISION_MODEL, DEFAULT_SPARK_MODEL } from '@/lib/extraction';

const VALID_VISION_MODELS = Object.keys(VISION_MODELS) as VisionModel[];
const VALID_SPARK_MODELS = Object.keys(SPARK_MODELS) as SparkModel[];

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

        const visionModel = tenant?.settings?.vision_model || DEFAULT_VISION_MODEL;
        const sparkModel = tenant?.settings?.spark_model || DEFAULT_SPARK_MODEL;
        const aiReasoningEnabled = tenant?.settings?.ai_reasoning_enabled ?? true;

        return NextResponse.json({
            success: true,
            data: { 
                vision_model: visionModel,
                spark_model: sparkModel,
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
        const { vision_model, spark_model, ai_reasoning_enabled } = body;

        // Validate vision_model if provided
        if (vision_model !== undefined && !VALID_VISION_MODELS.includes(vision_model)) {
            return NextResponse.json(
                { success: false, error: `Invalid vision model. Must be one of: ${VALID_VISION_MODELS.join(', ')}` },
                { status: 400 }
            );
        }

        // Validate spark_model if provided
        if (spark_model !== undefined && !VALID_SPARK_MODELS.includes(spark_model)) {
            return NextResponse.json(
                { success: false, error: `Invalid spark model. Must be one of: ${VALID_SPARK_MODELS.join(', ')}` },
                { status: 400 }
            );
        }

        // At least one setting must be provided
        if (vision_model === undefined && spark_model === undefined && ai_reasoning_enabled === undefined) {
            return NextResponse.json(
                { success: false, error: 'At least one setting must be provided' },
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
            ...(spark_model !== undefined && { spark_model }),
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
                spark_model: updatedSettings.spark_model,
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
