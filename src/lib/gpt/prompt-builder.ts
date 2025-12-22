/**
 * GPT Prompt Builder
 * Dynamically generates GPT Vision prompts from extraction profiles.
 */

import type { FieldDefinition, ExtractionProfile } from '@/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Get the default extraction profile
 */
export async function getDefaultProfile(): Promise<ExtractionProfile | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('extraction_profiles')
        .select('*')
        .eq('is_default', true)
        .single();

    if (error || !data) {
        console.error('Failed to get default profile:', error);
        return null;
    }

    return data as ExtractionProfile;
}

/**
 * Get extraction profile by ID
 */
export async function getProfile(profileId: string): Promise<ExtractionProfile | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('extraction_profiles')
        .select('*')
        .eq('id', profileId)
        .single();

    if (error || !data) {
        return null;
    }

    return data as ExtractionProfile;
}

/**
 * Build the system prompt for GPT Vision based on field definitions
 */
export function buildSystemPrompt(fields: FieldDefinition[], additionalInstructions?: string): string {
    const fieldDescriptions = fields.map(f => {
        let desc = `- ${f.key}: ${f.label}`;
        if (f.instructions) desc += ` (${f.instructions})`;
        if (f.required) desc += ' [REQUIRED]';
        if (f.type === 'enum' && f.enumValues) {
            desc += ` - allowed values: ${f.enumValues.join(', ')}`;
        }
        return desc;
    }).join('\n');

    const jsonSchema = buildJsonSchema(fields);

    return `You are a product data extraction assistant. Extract product information from the provided document (PDF or image).

## Fields to Extract
${fieldDescriptions}

## Output Format
Return a JSON object with an array of products. Each product should have the following structure:
${JSON.stringify(jsonSchema, null, 2)}

## Important Rules
1. Extract ALL products found in the document
2. If a field is not found, use an empty string ""
3. For prices, include the currency symbol if visible
4. For quantities, extract the numeric value
5. Be precise - extract exactly what is shown, don't infer or guess
6. Return valid JSON only${additionalInstructions ? `\n\n## Additional Instructions\n${additionalInstructions}` : ''}`;
}

/**
 * Build JSON schema example from field definitions
 */
function buildJsonSchema(fields: FieldDefinition[]): object {
    const example: Record<string, string> = {};

    for (const field of fields) {
        switch (field.type) {
            case 'number':
                example[field.key] = '1';
                break;
            case 'currency':
                example[field.key] = '€99.00';
                break;
            default:
                example[field.key] = field.defaultValue || '';
        }
    }

    return {
        products: [example]
    };
}

/**
 * Get the prompt for a profile (fetches from DB if needed)
 */
export async function getPromptForProfile(profileId?: string): Promise<string> {
    let profile: ExtractionProfile | null;

    if (profileId) {
        profile = await getProfile(profileId);
    } else {
        profile = await getDefaultProfile();
    }

    if (!profile) {
        // Fallback to hardcoded default
        return getDefaultPrompt();
    }

    return buildSystemPrompt(profile.fields, profile.prompt_additions);
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
