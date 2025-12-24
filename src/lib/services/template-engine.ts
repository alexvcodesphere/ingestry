/**
 * SKU Template Engine
 * Parses and evaluates SKU templates with variable placeholders.
 * 
 * Template syntax: {variable.code:N} or {variable:N}
 * 
 * Modifiers:
 *   .code  - Use the lookup code (e.g., "NV" for "Nike")
 *   :N     - Truncate/pad to N characters
 * 
 * Examples:
 *   {brand:2}      - First 2 characters of brand value
 *   {brand.code}   - Lookup code for brand (e.g., "NK" for "Nike")
 *   {color.code:2} - Lookup code for color, padded to 2 chars
 *   {sequence:3}   - Sequence number, padded to 3 digits
 *   {size}         - Size value, as-is
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Template variable definition
 */
export interface TemplateVariable {
    name: string;
    useCode?: boolean;  // Whether to use lookup code (.code modifier)
    customKey?: string; // Custom column key from extra_data (e.g., .xentral_code)
    modifier?: number;  // Length/padding modifier (:N)
}

/**
 * Context for template evaluation
 * All field values come from the product data dynamically.
 * Only 'sequence' is computed.
 */
export interface TemplateContext {
    /** All field values from the product (normalized and raw) */
    values: Record<string, string>;
    /** Sequence number for this product in the batch */
    sequence: number;
    /** Mapping from field key to lookup type (from normalize_with) */
    lookupTypeMapping?: Record<string, string>;
}

/**
 * Parse a template string into segments
 * Supports: {variable}, {variable:N}, {variable.code}, {variable.code:N}, {variable.custom_key}
 */
export function parseTemplate(template: string): Array<string | TemplateVariable> {
    const segments: Array<string | TemplateVariable> = [];
    // Match: {name} or {name.key} or {name:N} or {name.key:N}
    // key can be 'code' or any custom column key
    const regex = /\{([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_]*))?(?::(\d+))?\}/g;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(template)) !== null) {
        // Add literal text before this variable
        if (match.index > lastIndex) {
            segments.push(template.slice(lastIndex, match.index));
        }

        const keyModifier = match[2]; // The .xxx part

        // Add the variable
        segments.push({
            name: match[1],
            useCode: keyModifier === 'code',
            customKey: keyModifier && keyModifier !== 'code' ? keyModifier : undefined,
            modifier: match[3] ? parseInt(match[3], 10) : undefined,
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
 * - {sequence} is computed
 * - {variable.code} uses lookup codes
 * - {variable.custom_key} uses extra_data custom columns
 * - All other variables use raw values
 */
export async function resolveVariable(
    variable: TemplateVariable,
    context: TemplateContext,
    lookups: Map<string, Map<string, string>>,
    extraDataLookups: Map<string, Map<string, Record<string, unknown>>>
): Promise<string> {
    let value: string;

    // Sequence is a computed field
    if (variable.name === 'sequence') {
        value = String(context.sequence);
    } else {
        // Get the raw value from context
        const rawValue = getContextValue(variable.name, context);

        if (variable.useCode) {
            // Use lookup code (.code modifier)
            // Map field key to lookup type using normalize_with mapping
            const lookupType = context.lookupTypeMapping?.[variable.name] || variable.name;
            const lookupResult = await lookupCode(lookupType, rawValue, lookups);
            value = lookupResult !== '00' ? lookupResult : rawValue;
        } else if (variable.customKey) {
            // Use custom column from extra_data
            // Map field key to lookup type using normalize_with mapping
            const lookupType = context.lookupTypeMapping?.[variable.name] || variable.name;
            const extraData = await lookupExtraData(lookupType, rawValue, extraDataLookups);
            value = extraData[variable.customKey] !== undefined ? String(extraData[variable.customKey]) : '';
        } else {
            // No modifier - use raw value directly
            value = rawValue;
        }
    }

    // Apply :N modifier (length/padding)
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
 * No special handling - returns extracted value or empty string.
 */
function getContextValue(name: string, context: TemplateContext): string {
    return context.values[name] || '';
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
 * Look up extra_data from the extraData lookups map
 */
async function lookupExtraData(
    type: string,
    name: string,
    extraDataLookups: Map<string, Map<string, Record<string, unknown>>>
): Promise<Record<string, unknown>> {
    if (!name) return {};

    const normalized = name.toLowerCase().trim();
    const typeLookups = extraDataLookups.get(type);

    if (typeLookups) {
        // Try direct match
        if (typeLookups.has(normalized)) {
            return typeLookups.get(normalized)!;
        }

        // Try partial match
        for (const [key, extraData] of typeLookups) {
            if (normalized.includes(key) || key.includes(normalized)) {
                return extraData;
            }
        }
    }

    return {};
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
 * Load all code lookups with extra_data from database
 */
export async function loadExtraDataLookups(): Promise<Map<string, Map<string, Record<string, unknown>>>> {
    const supabase = await createClient();
    const lookups = new Map<string, Map<string, Record<string, unknown>>>();

    const { data, error } = await supabase
        .from('code_lookups')
        .select('field_key, name, aliases, extra_data');

    if (error || !data) {
        console.error('Failed to load extra_data lookups:', error);
        return lookups;
    }

    for (const row of data) {
        if (!lookups.has(row.field_key)) {
            lookups.set(row.field_key, new Map());
        }

        const fieldLookup = lookups.get(row.field_key)!;
        const normalized = row.name.toLowerCase().trim();
        const extraData = (row.extra_data || {}) as Record<string, unknown>;
        fieldLookup.set(normalized, extraData);

        // Add aliases
        if (row.aliases && Array.isArray(row.aliases)) {
            for (const alias of row.aliases) {
                fieldLookup.set(alias.toLowerCase().trim(), extraData);
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
    const extraDataLookups = await loadExtraDataLookups();

    const parts: string[] = [];
    for (const segment of segments) {
        if (typeof segment === 'string') {
            parts.push(segment);
        } else {
            const value = await resolveVariable(segment, context, lookups, extraDataLookups);
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

