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
    normalize_with?: string;
}

/**
 * Processing profile from database
 */
export interface ProcessingProfile {
    id: string;
    tenant_id: string;
    name: string;
    fields: FieldConfig[];
    sku_template?: string;
    generate_sku?: boolean;
    is_default: boolean;
}

/**
 * Get processing profile by ID
 */
export async function getProcessingProfile(profileId?: string): Promise<ProcessingProfile | null> {
    const supabase = await createClient();

    if (profileId) {
        const { data, error } = await supabase
            .from('processing_profiles')
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
        .from('processing_profiles')
        .select('*')
        .eq('is_default', true)
        .single();

    if (error || !data) {
        // Fallback: get any profile
        const { data: anyProfile } = await supabase
            .from('processing_profiles')
            .select('*')
            .limit(1)
            .single();

        return anyProfile as ProcessingProfile || null;
    }

    return data as ProcessingProfile;
}

/**
 * Build the system prompt from profile fields
 */
export function buildSystemPrompt(fields: FieldConfig[]): string {
    const fieldDescriptions = fields.map(f => {
        let desc = `- ${f.key}: ${f.label}`;
        if (f.required) desc += ' [REQUIRED]';
        return desc;
    }).join('\n');

    const jsonSchema = buildJsonSchema(fields);

    return `You are a product data extraction assistant. Extract product information from the provided document (PDF or image).

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
6. Return valid JSON only`;
}

/**
 * Build JSON schema example from field definitions
 */
function buildJsonSchema(fields: FieldConfig[]): object {
    const example: Record<string, string> = {};

    for (const field of fields) {
        example[field.key] = '';
    }

    return {
        products: [example]
    };
}

/**
 * Get the prompt for a profile (fetches from DB if needed)
 */
export async function getPromptForProfile(profileId?: string): Promise<{ prompt: string; profile: ProcessingProfile | null }> {
    const profile = await getProcessingProfile(profileId);

    if (!profile || !profile.fields || profile.fields.length === 0) {
        // Fallback to hardcoded default
        return { prompt: getDefaultPrompt(), profile: null };
    }

    return { prompt: buildSystemPrompt(profile.fields), profile };
}

/**
 * Default hardcoded prompt (fallback)
 */
function getDefaultPrompt(): string {
    return `You are a product data extraction assistant specializing in fashion order confirmations.

Extract ALL products from the provided document. For each product, capture:
- name: Full product name as shown
- brand: Brand or designer name
- sku: Existing SKU or article number if present
- color: Colour name or code
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
}

// Re-export the FieldConfig type for other modules
export type { FieldConfig };
