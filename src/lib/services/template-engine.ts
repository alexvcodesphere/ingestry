/**
 * SKU Template Engine
 * Parses and evaluates SKU templates with variable placeholders.
 * 
 * Template syntax: {variable:modifier}
 * Examples:
 *   {brand:2}     - Brand code, 2 characters
 *   {sequence:3}  - Sequence number, padded to 3 digits
 *   {size}        - Size value, as-is
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Template variable definition
 */
export interface TemplateVariable {
    name: string;
    modifier?: number;  // Length/padding modifier
}

/**
 * Context for template evaluation
 */
export interface TemplateContext {
    brand?: string;
    category?: string;
    color?: string;
    size?: string;
    gender?: string;
    season?: string;
    ean?: string;
    sequence: number;
    year?: number;
    custom?: Record<string, string>;
}

/**
 * Parse a template string into segments
 */
export function parseTemplate(template: string): Array<string | TemplateVariable> {
    const segments: Array<string | TemplateVariable> = [];
    const regex = /\{([^}:]+)(?::(\d+))?\}/g;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(template)) !== null) {
        // Add literal text before this variable
        if (match.index > lastIndex) {
            segments.push(template.slice(lastIndex, match.index));
        }

        // Add the variable
        segments.push({
            name: match[1],
            modifier: match[2] ? parseInt(match[2], 10) : undefined,
        });

        lastIndex = match.index + match[0].length;
    }

    // Add remaining literal text
    if (lastIndex < template.length) {
        segments.push(template.slice(lastIndex));
    }

    return segments;
}

/**
 * Resolve a single variable to its value
 * Only {sequence} is computed - all other variables use lookups or raw values
 */
export async function resolveVariable(
    variable: TemplateVariable,
    context: TemplateContext,
    lookups: Map<string, Map<string, string>>
): Promise<string> {
    let value: string;

    // Only sequence is computed, everything else goes through lookup
    if (variable.name === 'sequence') {
        value = String(context.sequence);
    } else {
        // Get the raw value from context
        const rawValue = getContextValue(variable.name, context);

        // Try to look up a code for this value
        const lookupResult = await lookupCode(variable.name, rawValue, lookups);

        // Use lookup result if found, otherwise use raw value
        value = lookupResult !== '00' ? lookupResult : rawValue;
    }

    // Apply modifier (length/padding)
    if (variable.modifier) {
        if (/^\d+$/.test(value)) {
            // Numeric: pad with zeros
            value = value.padStart(variable.modifier, '0');
        } else {
            // Text: truncate or pad
            value = value.slice(0, variable.modifier).padEnd(variable.modifier, 'X').toUpperCase();
        }
    }

    return value;
}

/**
 * Get a value from the template context by variable name
 */
function getContextValue(name: string, context: TemplateContext): string {
    // Check direct context properties first
    const directProps: Record<string, string | undefined> = {
        brand: context.brand,
        category: context.category,
        color: context.color,
        size: context.size,
        gender: context.gender,
        season: context.season,
        season_type: context.custom?.['season_type'],
        ean: context.ean,
        year: context.year?.toString(),
    };

    if (name in directProps && directProps[name]) {
        return directProps[name] || '';
    }

    // Check custom context
    if (context.custom?.[name]) {
        return context.custom[name];
    }

    // Legacy custom.* syntax
    if (name.startsWith('custom.')) {
        const key = name.slice(7);
        return context.custom?.[key] || '';
    }

    return '';
}

/**
 * Look up a code from the code_lookups table
 */
async function lookupCode(
    type: string,
    name: string,
    lookups: Map<string, Map<string, string>>
): Promise<string> {
    if (!name) return '00';

    const normalized = name.toLowerCase().trim();
    const typeLookups = lookups.get(type);

    if (typeLookups) {
        // Try direct match
        if (typeLookups.has(normalized)) {
            return typeLookups.get(normalized)!;
        }

        // Try partial match
        for (const [key, code] of typeLookups) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return code;
            }
        }
    }

    return '00';
}

/**
 * Load all code lookups from database
 */
export async function loadCodeLookups(): Promise<Map<string, Map<string, string>>> {
    const supabase = await createClient();
    const lookups = new Map<string, Map<string, string>>();

    const { data, error } = await supabase
        .from('code_lookups')
        .select('field_key, name, code, aliases');

    if (error || !data) {
        console.error('Failed to load code lookups:', error);
        return lookups;
    }

    for (const row of data) {
        if (!lookups.has(row.field_key)) {
            lookups.set(row.field_key, new Map());
        }

        const fieldLookup = lookups.get(row.field_key)!;
        const normalized = row.name.toLowerCase().trim();
        fieldLookup.set(normalized, row.code);

        // Add aliases
        if (row.aliases && Array.isArray(row.aliases)) {
            for (const alias of row.aliases) {
                fieldLookup.set(alias.toLowerCase().trim(), row.code);
            }
        }
    }

    return lookups;
}

/**
 * Evaluate a template with the given context
 */
export async function evaluateTemplate(
    template: string,
    context: TemplateContext
): Promise<string> {
    const segments = parseTemplate(template);
    const lookups = await loadCodeLookups();

    const parts: string[] = [];
    for (const segment of segments) {
        if (typeof segment === 'string') {
            parts.push(segment);
        } else {
            const value = await resolveVariable(segment, context, lookups);
            parts.push(value);
        }
    }

    return parts.join('');
}

/**
 * Get the default SKU template from database
 * Throws error if no default template is configured
 */
export async function getDefaultTemplate(): Promise<string> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sku_templates')
        .select('template')
        .eq('is_default', true)
        .single();

    if (error || !data) {
        throw new Error('No default SKU template found. Please configure a default template in Settings → Templates.');
    }

    return data.template;
}

/**
 * Generate SKU using a template (defaults to stored template if not provided)
 */
export async function generateSkuFromTemplate(
    context: TemplateContext,
    templateOverride?: string
): Promise<string> {
    const template = templateOverride || await getDefaultTemplate();
    return evaluateTemplate(template, context);
}

