/**
 * AI Enrichment Service (AI SDK v6)
 * Generates values for computed fields using AI based on product data and prompts.
 * 
 * Lightweight design:
 * - Batches multiple fields for efficiency
 * - Uses fast Gemini model via AI SDK
 * - Modular: can be called from template regeneration or standalone
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { intentModel } from '@/lib/extraction/unified-ai-client';

/** Field to enrich with AI */
export interface EnrichmentField {
    key: string;
    label: string;
    ai_prompt: string;
    fallback?: string;
}

/** Product data for enrichment */
export interface ProductData {
    id: string;
    data: Record<string, unknown>;
}

/** Result of enrichment */
export interface EnrichmentResult {
    id: string;
    enrichments: Record<string, string>;
}

/**
 * Enrich a batch of products with AI-generated values
 * 
 * @param fields - Fields to enrich (with ai_prompt)
 * @param products - Products to enrich
 * @param _apiKey - Deprecated, uses env var now. Kept for API compatibility.
 * @returns Enrichment results for each product
 */
export async function enrichProducts(
    fields: EnrichmentField[],
    products: ProductData[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _apiKey?: string
): Promise<EnrichmentResult[]> {
    if (fields.length === 0 || products.length === 0) {
        return [];
    }

    const results: EnrichmentResult[] = [];

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(product => enrichSingleProduct(fields, product))
        );
        results.push(...batchResults);
    }

    return results;
}

/**
 * Build dynamic Zod schema for enrichment fields
 */
function buildEnrichmentSchema(fields: EnrichmentField[]) {
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    
    for (const field of fields) {
        fieldSchemas[field.key] = z.string().describe(field.ai_prompt);
    }
    
    return z.object(fieldSchemas);
}

/**
 * Enrich a single product with AI-generated values
 */
async function enrichSingleProduct(
    fields: EnrichmentField[],
    product: ProductData
): Promise<EnrichmentResult> {
    const enrichments: Record<string, string> = {};

    // Build context from product data
    const productContext = Object.entries(product.data)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

    const systemPrompt = `You are a product data enrichment assistant. Generate values for the requested fields based on the product context.

## Product Data
${productContext}

## Fields to Generate
${fields.map(f => `- ${f.key}: ${f.ai_prompt}`).join('\n')}

## Instructions
1. Generate a value for each field based on its prompt and the product data
2. Be concise and accurate
3. If you cannot generate a value, use an empty string`;

    try {
        const schema = buildEnrichmentSchema(fields);
        
        const result = await generateObject({
            model: intentModel,
            schema,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: 'Generate the field values based on the product data.',
                },
            ],
        });

        // Extract enrichments from result
        for (const field of fields) {
            const value = (result.object as Record<string, string>)[field.key];
            enrichments[field.key] = value || field.fallback || '';
        }
    } catch (error) {
        console.error('[AI Enrichment] Error:', error);
        // Use fallbacks on error
        for (const field of fields) {
            enrichments[field.key] = field.fallback || '';
        }
    }

    return {
        id: product.id,
        enrichments,
    };
}

/**
 * Enrich a single field for a single product (simpler API for single-field use)
 */
export async function enrichSingleField(
    field: EnrichmentField,
    productData: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _apiKey?: string
): Promise<string> {
    const productContext = Object.entries(productData)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

    const systemPrompt = `Based on this product data:
${productContext}

${field.ai_prompt}

Respond with ONLY the generated value, no explanation.`;

    try {
        const schema = z.object({
            value: z.string().describe(field.ai_prompt),
        });
        
        const result = await generateObject({
            model: intentModel,
            schema,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: 'Generate the value.',
                },
            ],
        });

        return result.object.value || field.fallback || '';
    } catch (error) {
        console.error('[AI Enrichment] Single field error:', error);
        return field.fallback || '';
    }
}
