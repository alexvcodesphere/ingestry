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
    colour?: string;
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
 */
export async function resolveVariable(
    variable: TemplateVariable,
    context: TemplateContext,
    lookups: Map<string, Map<string, string>>
): Promise<string> {
    let value: string;

    switch (variable.name) {
        case 'brand':
            value = await lookupCode('brand', context.brand || '', lookups);
            break;
        case 'category':
            value = await lookupCode('category', context.category || '', lookups);
            break;
        case 'colour':
        case 'color':
            value = await lookupCode('colour', context.colour || '', lookups);
            break;
        case 'gender':
            value = resolveGender(context.gender || 'unisex');
            break;
        case 'season':
            value = resolveSeason(context.season || '');
            break;
        case 'size':
            value = context.size || '';
            break;
        case 'ean':
            value = context.ean || '';
            break;
        case 'sequence':
            value = String(context.sequence);
            break;
        case 'year':
            value = String(context.year || new Date().getFullYear() % 100);
            break;
        default:
            // Try as a dynamic lookup type (custom types like material, collection, etc.)
            // First check if there's a lookup for this type
            const lookupValue = await lookupCode(variable.name, context.custom?.[variable.name] || '', lookups);
            if (lookupValue !== '00') {
                value = lookupValue;
            } else if (variable.name.startsWith('custom.')) {
                // Legacy custom.* syntax for direct values
                const key = variable.name.slice(7);
                value = context.custom?.[key] || '';
            } else {
                // Check custom context for the value directly
                value = context.custom?.[variable.name] || '';
            }
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
 * Resolve gender to code
 */
function resolveGender(gender: string): string {
    const g = gender.toLowerCase();
    if (g.includes('women') || g.includes('female') || g === 'w' || g === 'f') return 'W';
    if ((g.includes('men') && !g.includes('women')) || g === 'm' || g === 'male') return 'M';
    return 'U';
}

/**
 * Resolve season to code
 * Format: SS23 -> 123, AW24 -> 224, CarryOver -> 300, Archive -> 400
 */
function resolveSeason(season: string): string {
    if (!season) {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear() % 100;
        return month >= 1 && month <= 6 ? `1${year}` : `2${year}`;
    }

    const upper = season.toUpperCase().replace(/\s+/g, '');

    if (upper === 'CARRYOVER' || upper === 'CO') return '300';
    if (upper === 'ARCHIVE') return '400';

    let prefix = '';
    let year = '';

    if (upper.startsWith('SS')) {
        prefix = '1';
        year = upper.replace('SS', '');
    } else if (upper.startsWith('AW')) {
        prefix = '2';
        year = upper.replace('AW', '');
    } else if (upper.includes('SPRING') || upper.includes('SUMMER')) {
        prefix = '1';
        const match = upper.match(/\d{2,4}/);
        year = match ? match[0] : '';
    } else if (upper.includes('AUTUMN') || upper.includes('FALL') || upper.includes('WINTER')) {
        prefix = '2';
        const match = upper.match(/\d{2,4}/);
        year = match ? match[0] : '';
    } else {
        const match = upper.match(/\d{2,4}/);
        if (match) {
            year = match[0];
            prefix = '1';
        } else {
            const now = new Date();
            const month = now.getMonth();
            const currentYear = now.getFullYear() % 100;
            return month >= 1 && month <= 6 ? `1${currentYear}` : `2${currentYear}`;
        }
    }

    if (year.length === 4) year = year.slice(-2);
    if (!year) year = String(new Date().getFullYear() % 100);

    return `${prefix}${year}`;
}

/**
 * Load all code lookups from database
 */
export async function loadCodeLookups(): Promise<Map<string, Map<string, string>>> {
    const supabase = await createClient();
    const lookups = new Map<string, Map<string, string>>();

    const { data, error } = await supabase
        .from('code_lookups')
        .select('type, name, code, aliases');

    if (error || !data) {
        console.error('Failed to load code lookups:', error);
        return lookups;
    }

    for (const row of data) {
        if (!lookups.has(row.type)) {
            lookups.set(row.type, new Map());
        }

        const typeLookup = lookups.get(row.type)!;
        const normalized = row.name.toLowerCase().trim();
        typeLookup.set(normalized, row.code);

        // Add aliases
        if (row.aliases && Array.isArray(row.aliases)) {
            for (const alias of row.aliases) {
                typeLookup.set(alias.toLowerCase().trim(), row.code);
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
 */
export async function getDefaultTemplate(): Promise<string> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sku_templates')
        .select('template')
        .eq('is_default', true)
        .single();

    if (error || !data) {
        // Fallback to hardcoded default
        return '{season}{brand:2}{gender}{category:2}{colour:2}{sequence:3}-{size}';
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

