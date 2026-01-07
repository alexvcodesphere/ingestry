/**
 * Spark Tool Definitions
 * Native tool calling for the Spark agentic assistant.
 * 
 * Implements the Schema Master pattern: tools are dynamically configured
 * based on the active Input Profile's field definitions.
 */

import { z } from 'zod';

/**
 * Profile field configuration (subset from prompt-builder)
 */
export interface SparkFieldConfig {
    key: string;
    label: string;
    type?: 'string' | 'number' | 'boolean';
    use_template?: boolean;
    template?: string;
    source?: 'extracted' | 'computed';
}

/**
 * Result from patch_items tool execution
 * Returns full item data for optimistic UI updates
 */
export interface PatchItemsResult {
    success: boolean;
    count: number;
    field: string;
    value: unknown;
    /** Full updated items for immediate UI refresh */
    items: Array<{
        id: string;
        data: Record<string, unknown>;
    }>;
    /** Session ID for undo capability */
    sessionId: string;
}

/**
 * Result from recalculate_fields tool execution
 */
export interface RecalculateFieldsResult {
    success: boolean;
    count: number;
    fields: string[];
    items: Array<{
        id: string;
        data: Record<string, unknown>;
    }>;
}

/**
 * Result from query_order_data tool execution
 */
export interface QueryOrderDataResult {
    type: 'count' | 'list' | 'unique' | 'filter';
    field?: string;
    result: unknown;
    summary: string;
}

/**
 * Create the patch_items tool schema dynamically based on profile fields.
 * This is the "Schema Master" pattern - validation respects profile types.
 */
export function createPatchItemsSchema(fields: SparkFieldConfig[]) {
    const fieldKeys = fields.map(f => f.key);
    
    return z.object({
        item_ids: z.array(z.string()).describe('IDs of the items to update'),
        field_key: z.string().describe(`The field to update. Valid fields: ${fieldKeys.join(', ')}`),
        value: z.union([z.string(), z.number(), z.boolean()]).describe('The new value for the field'),
    });
}

/**
 * Schema for recalculate_fields tool
 */
export const recalculateFieldsSchema = z.object({
    field_keys: z.array(z.string()).optional().describe('Specific computed field keys to recalculate. If empty, recalculates all computed fields.'),
    item_ids: z.array(z.string()).optional().describe('Specific item IDs to target. If empty, targets all items or the current selection.'),
});

/**
 * Schema for query_order_data tool
 */
export const queryOrderDataSchema = z.object({
    query_type: z.enum(['count', 'list', 'unique', 'filter']).describe('Type of query to execute'),
    field_key: z.string().optional().describe('Field to analyze or filter by'),
    filter_value: z.string().optional().describe('Value to filter by (for filter type queries)'),
});

/**
 * Schema for suggest_catalog_alias tool
 * Suggests adding new aliases to catalog entries - requires user confirmation
 */
export const suggestCatalogAliasSchema = z.object({
    catalog_key: z.string().describe('The catalog to add the alias to (e.g., "colors", "brands", "materials")'),
    value: z.string().describe('The non-matching value found in the data (e.g., "TANGERINE")'),
    suggested_canonical: z.string().describe('The existing catalog entry this should map to (e.g., "Orange")'),
    reason: z.string().describe('Brief explanation of why this alias makes sense'),
});

/**
 * Result from suggest_catalog_alias tool
 */
export interface SuggestCatalogAliasResult {
    success: boolean;
    suggestion: {
        catalog_key: string;
        value: string;
        suggested_canonical: string;
        reason: string;
    };
    message: string;
}

/**
 * Build tool descriptions with profile context
 */
export function buildToolDescriptions(fields: SparkFieldConfig[]) {
    const sourceFields = fields.filter(f => f.source !== 'computed');
    const computedFields = fields.filter(f => f.source === 'computed' || f.use_template);
    
    return {
        patch_items: `Update specific fields on specific items. Use this to modify data values.
Available fields to modify: ${sourceFields.map(f => `${f.key} (${f.label})`).join(', ')}.
Returns the full updated items for immediate UI refresh.`,
        
        recalculate_fields: `Regenerate computed/virtual fields from their templates. Use when the user asks to "recalculate", "regenerate", or "refresh" computed values.
Computed fields: ${computedFields.map(f => `${f.key} (template: ${f.template || 'AI enrichment'})`).join(', ')}.
Can be chained after patch_items to update templates after source value changes.`,
        
        query_order_data: `Read-only access to analyze the current data. Use for questions like "How many items are red?" or "List all unique brands".
Available fields: ${fields.map(f => f.key).join(', ')}.`,
    };
}

/**
 * Validate that a field key exists in the profile
 */
export function validateFieldKey(key: string, fields: SparkFieldConfig[]): boolean {
    const fieldLookup = new Map(fields.map(f => [f.key.toLowerCase(), f]));
    return fieldLookup.has(key.toLowerCase());
}

/**
 * Get the canonical field key (correct casing)
 */
export function getCanonicalFieldKey(key: string, fields: SparkFieldConfig[]): string | undefined {
    const fieldLookup = new Map(fields.map(f => [f.key.toLowerCase(), f.key]));
    return fieldLookup.get(key.toLowerCase());
}

/**
 * Parse and coerce a value to the field's expected type
 */
export function coerceFieldValue(
    key: string, 
    value: unknown, 
    fields: SparkFieldConfig[]
): unknown {
    const field = fields.find(f => f.key.toLowerCase() === key.toLowerCase());
    if (!field) return value;
    
    switch (field.type) {
        case 'number':
            return typeof value === 'number' ? value : Number(value);
        case 'boolean':
            return typeof value === 'boolean' ? value : value === 'true';
        default:
            return String(value);
    }
}
