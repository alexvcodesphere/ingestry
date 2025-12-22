/**
 * API endpoint to test normalization
 * Returns detailed information about how a value would be normalized
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeWithDetails } from '@/lib/services/lookup-normalizer';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { value, lookupType } = body;

        if (!value || !lookupType) {
            return NextResponse.json(
                { error: 'Both value and lookupType are required' },
                { status: 400 }
            );
        }

        const result = await normalizeWithDetails(value, lookupType, true);

        return NextResponse.json(result);
    } catch (error) {
        console.error('Normalization test error:', error);
        return NextResponse.json(
            { error: 'Failed to test normalization' },
            { status: 500 }
        );
    }
}
