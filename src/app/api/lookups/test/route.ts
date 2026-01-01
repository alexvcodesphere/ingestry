/**
 * API endpoint to test catalog matching
 * Returns detailed information about how a value would be matched against a catalog
 */

import { NextRequest, NextResponse } from 'next/server';
import { reconcileMetadata } from '@/lib/services/catalog-reconciler';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { value, catalogKey } = body;

        // Support legacy parameter name
        const key = catalogKey || body.lookupType;

        if (!value || !key) {
            return NextResponse.json(
                { error: 'Both value and catalogKey are required' },
                { status: 400 }
            );
        }

        const result = await reconcileMetadata(value, key, true);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Catalog matching test error:', error);
        return NextResponse.json(
            { error: 'Failed to test catalog matching' },
            { status: 500 }
        );
    }
}
