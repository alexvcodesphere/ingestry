/**
 * GPT Prompt Builder
 * Dynamically generates GPT Vision prompts from processing profiles.
 */

import { createClient } from '@/lib/supabase/server';

/**
 * Field configuration from processing profile
 */
interface FieldConfig {
    key: string;
    label: string;
    required?: boolean;
    catalog_key?: string;     // catalog key for matching during extraction
    use_template?: boolean;   // if true, value is computed from template
    template?: string;        // template string e.g. "{brand} - {name}"
    fallback?: string;        // default value if extraction returns empty
}

/**
 * Processing profile from database
 */
export interface ProcessingProfile {
    id: string;
    tenant_id: string;
    name: string;
    fields: FieldConfig[];
    is_default: boolean;
}

/**
 * Get processing profile by ID
 */
export async function getProcessingProfile(profileId?: string): Promise<ProcessingProfile | null> {
    const supabase = await createClient();

    if (profileId) {
        const { data, error } = await supabase
            .from('input_profiles')
            .select('*')
            .eq('id', profileId)
            .single();

        if (error || !data) {
            console.error('Failed to get profile:', error);
            return null;
        }
        return data as ProcessingProfile;
    }

    // Get default profile
    const { data, error } = await supabase
        .from('input_profiles')
        .select('*')
        .eq('is_default', true)
        .single();

    if (error || !data) {
        // Fallback: get any profile
        const { data: anyProfile } = await supabase
            .from('input_profiles')
            .select('*')
            .limit(1)
            .single();

        return anyProfile as ProcessingProfile || null;
    }

    return data as ProcessingProfile;
}

/**
 * Options for prompt building
 */
export interface PromptOptions {
    enableReasoning?: boolean;
}

/**
 * Build the system prompt from profile fields
 * @param fields - Field configurations from processing profile
 * @param options - Prompt options (e.g., enableReasoning)
 * @param catalogGuide - Optional catalog guide for semantic matching
 */
export function buildSystemPrompt(
    fields: FieldConfig[], 
    options?: PromptOptions,
    catalogGuide?: string
): string {
    const fieldDescriptions = fields.map(f => {
        let desc = `- ${f.key}: ${f.label}`;
        if (f.required) desc += ' [REQUIRED]';
        if (f.catalog_key) desc += ` [MATCH WITH CATALOG: ${f.catalog_key}]`;
        return desc;
    }).join('\n');

    const jsonSchema = buildJsonSchema(fields, options?.enableReasoning);

    let prompt = `You are a product data extraction assistant. Extract product information from the provided document (PDF or image).

## Fields to Extract
${fieldDescriptions}

## Output Format
Return a JSON object with an array of products. Each product should have this structure:
${JSON.stringify(jsonSchema, null, 2)}

## Important Rules
1. Extract ALL products found in the document
2. If a field is not found, use an empty string ""
3. For prices, include the currency symbol if visible
4. For quantities, extract the numeric value
5. Be precise - extract exactly what is shown, don't infer or guess
6. Return valid JSON only

## CRITICAL: One Product Entry Per Unique Variant
The goal is automated ingestion into ERP/shop systems where each entry represents a unique purchasable item (SKU).
- If a product row contains multiple variants (sizes, colors, materials, etc.), split them into SEPARATE product entries
- Each entry should have a SINGLE value for each field (not comma-separated lists)
- Each entry should have its OWN quantity
- Interpret size grids, variant tables, or grouped data as individual items
- Example: A row showing "Jacket" with quantities for S, M, L becomes THREE entries, not one with quantity summed`;

    // Add reasoning instructions when enabled
    if (options?.enableReasoning) {
        prompt += `

## Uncertainty Flags
If you are NOT 100% confident about any extracted value, include a "needs_checking" array for that product.
Flag fields when:
- Text is partially obscured or low-resolution
- Multiple values exist and choice is ambiguous
- Value was inferred rather than directly stated
- Data required significant interpretation

Example:
{
  "products": [{
    "name": "...",
    "needs_checking": [{ "field": "price", "reason": "Multiple prices shown" }]
  }]
}`;
    }

    // Inject catalog matching instructions if guide provided
    if (catalogGuide) {
        prompt += `

## Catalog Match Guide
You are a catalog specialist. For fields marked with [MATCH WITH CATALOG], reconcile the document text with the valid options listed below. If a value is a synonym, abbreviation, or variant spelling (e.g., "Mdngt" → "Navy Blue", "BLK" → "Black"), output the EXACT canonical name from this list.

${catalogGuide}

IMPORTANT: Only use values from this catalog for matched fields. Do not invent or modify catalog names.`;
    }

    return prompt;
}

/**
 * Build JSON schema example from field definitions
 */
function buildJsonSchema(fields: FieldConfig[], includeNeedsChecking?: boolean): object {
    const example: Record<string, unknown> = {};

    for (const field of fields) {
        example[field.key] = '';
    }

    if (includeNeedsChecking) {
        example.needs_checking = [{ field: '', reason: '' }];
    }

    return {
        products: [example]
    };
}

/**
 * Get the prompt for a profile (fetches from DB if needed)
 * @param profileId - Optional profile ID to fetch
 * @param options - Prompt options
 * @param catalogGuide - Optional catalog guide for semantic matching
 */
export async function getPromptForProfile(
    profileId?: string,
    options?: PromptOptions,
    catalogGuide?: string
): Promise<{ prompt: string; profile: ProcessingProfile | null }> {
    const profile = await getProcessingProfile(profileId);

    if (!profile || !profile.fields || profile.fields.length === 0) {
        // Fallback to hardcoded default
        return { prompt: getDefaultPrompt(options), profile: null };
    }

    return { prompt: buildSystemPrompt(profile.fields, options, catalogGuide), profile };
}

/**
 * Default hardcoded prompt (fallback)
 * 
 * FALLBACK BEHAVIOR: Only used when no processing profile exists in the database.
 * New tenants should create a processing profile to customize extraction fields.
 */
function getDefaultPrompt(options?: PromptOptions): string {
    let prompt = `You are a product data extraction assistant specializing in fashion order confirmations.

Extract ALL products from the provided document. For each product, capture:
- name: Full product name as shown
- brand: Brand or designer name
- sku: Existing SKU or article number if present
- color: Color name or code
- size: Size (XS, S, M, L, XL, numeric, etc.)
- price: Unit price with currency symbol
- quantity: Number of units ordered
- ean: 13-digit EAN barcode if present
- articleNumber: Supplier article or style number
- styleCode: Style or model code
- designerCode: Designer's code if different from article number

Return a JSON object:
{
    "products": [
        { "name": "", "brand": "", "sku": "", "color": "", "size": "", "price": "", "quantity": "", "ean": "", "articleNumber": "", "styleCode": "", "designerCode": "" }
    ]
}

Important:
- Extract ALL products shown
- Use empty string "" for missing fields
- Include currency symbols with prices
- Be precise, don't infer`;

    if (options?.enableReasoning) {
        prompt += `
- If not 100% confident about a value, include a "needs_checking" array with { "field": "...", "reason": "..." }`;
    }

    return prompt;
}

// Re-export the FieldConfig type for other modules
export type { FieldConfig };
