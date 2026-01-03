/**
 * Export API Route
 * POST: Generate export file from draft order using export config from processing profile
 * GET: List available export configs from processing profiles
 * 
 * Note: Uses input_profiles table with export_configs JSONB column (post-migration 021)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportRecords } from '@/lib/export';
import type { OutputProfile, DataRecord } from '@/lib/export';
import type { DraftLineItem, ExportConfig } from '@/types';

interface ExportRequest {
    order_id: string;
    /** ID of the export config within the profile's export_configs array */
    export_config_id?: string;
    /** Index of the export config in the profile's array (fallback if id not found) */
    export_config_idx?: number;
}

/**
 * POST /api/export
 * Generate export file from a draft order using export config from processing profile.
 * Returns the file as a download or JSON response with data.
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Parse request body
        const body: ExportRequest = await request.json();
        const { order_id, export_config_id, export_config_idx } = body;

        if (!order_id) {
            return NextResponse.json(
                { success: false, error: 'order_id is required' },
                { status: 400 }
            );
        }

        // Fetch the draft order with line items and metadata (for profile_id)
        const { data: order, error: orderError } = await supabase
            .from('draft_orders')
            .select(`
                id,
                user_id,
                tenant_id,
                metadata,
                line_items:draft_line_items(normalized_data)
            `)
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }

        // First check for snapshotted export config in order metadata
        let exportConfig: ExportConfig | null = null;
        
        const snapshot = order?.metadata?.export_config_snapshot as ExportConfig | null;
        if (snapshot && !export_config_id) {
            // Use snapshot unless a specific config was requested
            exportConfig = snapshot;
        }

        // If no snapshot or specific config requested, fetch from profile
        if (!exportConfig) {
            const profileId = order?.metadata?.profile_id;
            if (!profileId) {
                return NextResponse.json(
                    { success: false, error: 'No processing profile associated with this order' },
                    { status: 400 }
                );
            }

            // Fetch the processing profile with export_configs
            const { data: profile, error: profileError } = await supabase
                .from('input_profiles')
                .select('export_configs, default_export_config_idx')
                .eq('id', profileId)
                .single();

            if (profileError || !profile) {
                return NextResponse.json(
                    { success: false, error: 'Processing profile not found' },
                    { status: 404 }
                );
            }

            const configs = (profile.export_configs || []) as ExportConfig[];
            if (configs.length === 0) {
                return NextResponse.json(
                    { success: false, error: 'No export configurations available in profile' },
                    { status: 400 }
                );
            }

            // Find the export config by id, idx, or default
            if (export_config_id) {
                exportConfig = configs.find(c => c.id === export_config_id) || null;
            } else if (export_config_idx !== undefined && configs[export_config_idx]) {
                exportConfig = configs[export_config_idx];
            } else if (profile.default_export_config_idx !== null && configs[profile.default_export_config_idx]) {
                exportConfig = configs[profile.default_export_config_idx];
            } else {
                exportConfig = configs[0]; // Fallback to first config
            }

            if (!exportConfig) {
                return NextResponse.json(
                    { success: false, error: 'Export configuration not found' },
                    { status: 404 }
                );
            }
        }

        // Extract normalized data from line items
        const lineItems = (order.line_items || []) as DraftLineItem[];
        const records: DataRecord[] = lineItems
            .filter(item => item.normalized_data)
            .map(item => item.normalized_data as DataRecord);

        if (records.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No data to export' },
                { status: 400 }
            );
        }

        // Convert ExportConfig to OutputProfile format for export module
        const outputProfile: OutputProfile = {
            id: exportConfig.id,
            name: exportConfig.name,
            shop_system: exportConfig.shop_system,
            field_mappings: exportConfig.field_mappings || [],
            format: exportConfig.format,
            format_options: exportConfig.format_options || {},
            is_default: exportConfig.is_default,
        };

        // Generate export
        const result = exportRecords(records, outputProfile);

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        // Check if client wants file download or JSON response
        const wantsDownload = request.headers.get('Accept')?.includes('text/csv') ||
            request.headers.get('Accept')?.includes('application/octet-stream');

        if (wantsDownload && result.data) {
            // Return as file download
            return new NextResponse(result.data, {
                status: 200,
                headers: {
                    'Content-Type': result.content_type || 'text/csv',
                    'Content-Disposition': `attachment; filename="${result.filename || 'export.csv'}"`,
                },
            });
        }

        // Return as JSON with data
        return NextResponse.json({
            success: true,
            data: {
                content: result.data,
                content_type: result.content_type,
                filename: result.filename,
                record_count: result.record_count,
            },
        });

    } catch (error) {
        console.error('POST /api/export error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/export
 * List available export configs from all processing profiles for the current tenant.
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

        // Fetch all profiles with their export configs
        const { data: profiles, error } = await supabase
            .from('input_profiles')
            .select('id, name, export_configs, default_export_config_idx')
            .order('name');

        if (error) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch profiles' },
                { status: 500 }
            );
        }

        // Flatten export configs with profile context
        const allConfigs = (profiles || []).flatMap(profile => {
            const configs = (profile.export_configs || []) as ExportConfig[];
            return configs.map((config, idx) => ({
                ...config,
                profile_id: profile.id,
                profile_name: profile.name,
                is_profile_default: idx === profile.default_export_config_idx,
            }));
        });

        return NextResponse.json({
            success: true,
            data: allConfigs,
        });

    } catch (error) {
        console.error('GET /api/export error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
