import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/catalogs/alias
 * Add a new alias to an existing catalog entry
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        
        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await req.json();
        const { catalog_key, alias_value, canonical_name } = body;

        if (!catalog_key || !alias_value || !canonical_name) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields: catalog_key, alias_value, canonical_name' },
                { status: 400 }
            );
        }

        // First, find the actual field_key (case-insensitive)
        const { data: fieldKeys } = await supabase
            .from('catalog_entries')
            .select('field_key')
            .ilike('field_key', catalog_key)
            .limit(1);
        
        const actualFieldKey = fieldKeys?.[0]?.field_key || catalog_key;

        // Find the catalog entry by field_key and name (case-insensitive)
        const { data: entries, error: findError } = await supabase
            .from('catalog_entries')
            .select('id, name, aliases')
            .ilike('field_key', catalog_key)
            .ilike('name', canonical_name);

        if (findError) {
            console.error('Failed to find catalog entry:', findError);
            return NextResponse.json(
                { success: false, error: 'Database error' },
                { status: 500 }
            );
        }

        // If no exact match, try to find similar entries for a better error
        if (!entries || entries.length === 0) {
            // Get all entries for this catalog (case-insensitive field_key)
            const { data: allEntries } = await supabase
                .from('catalog_entries')
                .select('name, field_key')
                .ilike('field_key', catalog_key)
                .limit(10);
            
            if (!allEntries || allEntries.length === 0) {
                // No catalog found at all - list available catalogs
                const { data: allCatalogs } = await supabase
                    .from('catalog_entries')
                    .select('field_key')
                    .limit(20);
                
                const uniqueCatalogs = [...new Set(allCatalogs?.map(c => c.field_key) || [])];
                return NextResponse.json(
                    { success: false, error: `Catalog "${catalog_key}" not found. Available catalogs: ${uniqueCatalogs.join(', ') || 'none'}` },
                    { status: 404 }
                );
            }
            
            const availableNames = allEntries.map(e => e.name).join(', ');
            return NextResponse.json(
                { success: false, error: `"${canonical_name}" not found in ${actualFieldKey}. Available: ${availableNames}` },
                { status: 404 }
            );
        }

        const entry = entries[0];

        // Check if alias already exists
        const existingAliases = entry.aliases || [];
        if (existingAliases.includes(alias_value)) {
            return NextResponse.json(
                { success: true, message: 'Alias already exists', alreadyExists: true }
            );
        }

        // Add the new alias
        const newAliases = [...existingAliases, alias_value];
        
        const { error: updateError } = await supabase
            .from('catalog_entries')
            .update({ aliases: newAliases })
            .eq('id', entry.id);

        if (updateError) {
            console.error('Failed to update catalog entry:', updateError);
            return NextResponse.json(
                { success: false, error: 'Failed to add alias' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Added "${alias_value}" as alias for "${canonical_name}"`,
            entry: {
                id: entry.id,
                aliases: newAliases,
            },
        });

    } catch (error) {
        console.error('POST /api/catalogs/alias error:', error);
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}
