/**
 * AI Enrichment Service
 * Generates values for computed fields using AI based on product data and prompts.
 * 
 * Lightweight design:
 * - Batches multiple fields for efficiency
 * - Uses fast Gemini model
 * - Modular: can be called from template regeneration or standalone
 */

import { GoogleGenAI } from "@google/genai";

const AI_MODEL = "gemini-2.0-flash";

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
 * @param apiKey - Gemini API key
 * @returns Enrichment results for each product
 */
export async function enrichProducts(
    fields: EnrichmentField[],
    products: ProductData[],
    apiKey: string
): Promise<EnrichmentResult[]> {
    if (fields.length === 0 || products.length === 0) {
        return [];
    }

    const ai = new GoogleGenAI({ apiKey });
    const results: EnrichmentResult[] = [];

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(product => enrichSingleProduct(fields, product, ai))
        );
        results.push(...batchResults);
    }

    return results;
}

/**
 * Enrich a single product with AI-generated values
 */
async function enrichSingleProduct(
    fields: EnrichmentField[],
    product: ProductData,
    ai: GoogleGenAI
): Promise<EnrichmentResult> {
    const enrichments: Record<string, string> = {};

    // Build context from product data
    const productContext = Object.entries(product.data)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

    // Build prompts for all fields
    const fieldPrompts = fields.map(f => ({
        key: f.key,
        prompt: f.ai_prompt,
        fallback: f.fallback || '',
    }));

    // Single AI call for all fields (more efficient)
    const systemPrompt = `You are a product data enrichment assistant. Generate values for the requested fields based on the product context.

## Product Data
${productContext}

## Fields to Generate
${fieldPrompts.map(f => `- ${f.key}: ${f.prompt}`).join('\n')}

## Instructions
1. Generate a value for each field based on its prompt and the product data
2. Be concise and accurate
3. If you cannot generate a value, use an empty string

## Output Format
Return a JSON object with each field key and its generated value:
{
${fieldPrompts.map(f => `  "${f.key}": "..."`).join(',\n')}
}

Return ONLY the JSON object, no markdown or explanation.`;

    try {
        const response = await ai.models.generateContent({
            model: AI_MODEL,
            contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
            config: {
                responseModalities: ['TEXT'],
                temperature: 0.3,
                maxOutputTokens: 500,
            },
        });

        const text = response.text?.trim() || '';
        
        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
                for (const field of fields) {
                    enrichments[field.key] = parsed[field.key] || field.fallback || '';
                }
            } catch {
                // JSON parse failed, use fallbacks
                for (const field of fields) {
                    enrichments[field.key] = field.fallback || '';
                }
            }
        } else {
            // No JSON found, use fallbacks
            for (const field of fields) {
                enrichments[field.key] = field.fallback || '';
            }
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
    apiKey: string
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    
    const productContext = Object.entries(productData)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');

    const prompt = `Based on this product data:
${productContext}

${field.ai_prompt}

Respond with ONLY the generated value, no explanation.`;

    try {
        const response = await ai.models.generateContent({
            model: AI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseModalities: ['TEXT'],
                temperature: 0.3,
                maxOutputTokens: 200,
            },
        });

        const text = response.text?.trim() || '';
        return text || field.fallback || '';
    } catch (error) {
        console.error('[AI Enrichment] Single field error:', error);
        return field.fallback || '';
    }
}
