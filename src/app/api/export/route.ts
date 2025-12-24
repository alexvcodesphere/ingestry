/**
 * Export API Route
 * POST: Generate export file from draft order using output profile
 * 
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { exportRecords } from '@/lib/export';
import type { OutputProfile, DataRecord } from '@/lib/export';
import type { DraftLineItem } from '@/types';

interface ExportRequest {
    order_id: string;
    profile_id: string;
}

/**
 * POST /api/export
 * Generate export file from a draft order using specified output profile.
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
        const { order_id, profile_id } = body;

        if (!order_id || !profile_id) {
            return NextResponse.json(
                { success: false, error: 'order_id and profile_id are required' },
                { status: 400 }
            );
        }

        // Fetch the draft order with line items
        const { data: order, error: orderError } = await supabase
            .from('draft_orders')
            .select(`
                *,
                line_items:draft_line_items(*)
            `)
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            return NextResponse.json(
                { success: false, error: 'Order not found' },
                { status: 404 }
            );
        }

        // Verify ownership
        if (order.user_id !== user.id) {
            return NextResponse.json(
                { success: false, error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Fetch the output profile
        const { data: profile, error: profileError } = await supabase
            .from('output_profiles')
            .select('*')
            .eq('id', profile_id)
            .single();

        if (profileError || !profile) {
            return NextResponse.json(
                { success: false, error: 'Output profile not found' },
                { status: 404 }
            );
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

        // Convert DB profile to typed OutputProfile
        const outputProfile: OutputProfile = {
            id: profile.id,
            tenant_id: profile.tenant_id,
            name: profile.name,
            description: profile.description,
            field_mappings: profile.field_mappings || [],
            format: profile.format || 'csv',
            format_options: profile.format_options || {},
            is_default: profile.is_default,
            created_at: profile.created_at,
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
 * GET /api/export/profiles
 * List available output profiles for the current tenant.
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

        const { data: profiles, error } = await supabase
            .from('output_profiles')
            .select('id, name, description, format, is_default')
            .order('name');

        if (error) {
            return NextResponse.json(
                { success: false, error: 'Failed to fetch profiles' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: profiles,
        });

    } catch (error) {
        console.error('GET /api/export error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
