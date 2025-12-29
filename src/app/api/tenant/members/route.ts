import { NextResponse } from 'next/server';
import { getTenantMembers } from '@/lib/services/tenant.service';

export async function GET() {
    try {
        const members = await getTenantMembers();
        return NextResponse.json({ success: true, data: members });
    } catch (error) {
        console.error('Failed to fetch tenant members:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
