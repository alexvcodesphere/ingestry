/**
 * AI SDK v6 Extraction Client
 * 
 * Unified extraction using generateObject with Zod schemas.
 * Supports both OpenAI and Gemini models through AI SDK providers.
 */

import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { extractionModel } from './unified-ai-client';
import type { ExtractionResult, ExtractedProductWithMeta, VisionModel } from './types';

// Create OpenAI provider for gpt-4o
const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

/**
 * Field configuration for schema building
 */
export interface FieldConfig {
    key: string;
    label: string;
    required?: boolean;
    source?: 'extracted' | 'computed';
    catalog_key?: string;
}

/**
 * Build a dynamic Zod schema from profile fields
 */
export function buildExtractionSchema(fields: FieldConfig[]) {
    // Only include source fields (not computed/virtual) for AI extraction
    const sourceFields = fields.filter(f => f.source !== 'computed');
    
    // Build needs_checking flag schema
    const needsCheckingSchema = z.object({
        field: z.string().describe('Field key that needs review'),
        reason: z.string().describe('Brief explanation of uncertainty'),
    });
    
    // Build product schema dynamically from fields
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    
    for (const field of sourceFields) {
        let fieldSchema = z.string().describe(field.label);
        
        if (field.catalog_key) {
            fieldSchema = fieldSchema.describe(`${field.label} - match with catalog: ${field.catalog_key}`);
        }
        
        if (!field.required) {
            fieldSchemas[field.key] = fieldSchema.optional();
        } else {
            fieldSchemas[field.key] = fieldSchema;
        }
    }
    
    // Add needs_checking as optional array
    fieldSchemas['needs_checking'] = z.array(needsCheckingSchema).optional().describe(
        'Fields where the AI is uncertain about the extracted value'
    );
    
    const productSchema = z.object(fieldSchemas);
    
    // Return schema for array of products
    return z.object({
        products: z.array(productSchema).describe('Array of extracted products from the document'),
    });
}

/**
 * Extract products from PDF using AI SDK v6 generateObject
 * 
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt System prompt from processing profile
 * @param fields Profile field configurations for schema building
 * @param model Vision model to use
 */
export async function extractWithAISDK(
    pdfBuffer: Buffer,
    systemPrompt: string,
    fields: FieldConfig[],
    model: VisionModel = "gemini-3-flash"
): Promise<ExtractionResult> {
    const startTime = Date.now();
    const base64Pdf = pdfBuffer.toString('base64');
    
    console.log(`[AI SDK Extraction] Using model: ${model}`);
    console.log(`[AI SDK Extraction] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    console.log(`[AI SDK Extraction] Fields: ${fields.length}`);
    
    // Build dynamic schema from fields
    const schema = buildExtractionSchema(fields);
    
    // Select the appropriate model based on provider
    let aiModel;
    
    switch (model) {
        case 'gpt-4o':
            aiModel = openai('gpt-4o');
            break;
        case 'gemini-3-flash':
        case 'gemini-3-pro':
        default:
            // Use the centralized extraction model from unified-ai-client
            aiModel = extractionModel;
            break;
    }
    
    try {
        console.log(`[AI SDK Extraction] Sending request...`);
        
        const result = await generateObject({
            model: aiModel,
            schema,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'file',
                            data: base64Pdf,
                            mediaType: 'application/pdf',
                        },
                        {
                            type: 'text',
                            text: 'Extract all products from this order confirmation PDF.',
                        },
                    ],
                },
            ],
        });
        
        const duration = Date.now() - startTime;
        console.log(`[AI SDK Extraction] Completed in ${duration}ms`);
        
        // Transform to our standard format
        const products: ExtractedProductWithMeta[] = (result.object.products as Record<string, unknown>[]).map(p => {
            const needsChecking = p.needs_checking as { field: string; reason: string }[] | undefined;
            const data: Record<string, string> = {};
            
            for (const [key, value] of Object.entries(p)) {
                if (key !== 'needs_checking' && value !== undefined && value !== null) {
                    data[key] = String(value);
                }
            }
            
            return { data, needs_checking: needsChecking };
        });
        
        console.log(`[AI SDK Extraction] ✅ Extracted ${products.length} products`);
        
        // Get usage from result (AI SDK v6 uses inputTokens/outputTokens)
        const usage = result.usage ? {
            promptTokens: result.usage.inputTokens ?? 0,
            completionTokens: result.usage.outputTokens ?? 0,
            totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
        } : undefined;
        
        return {
            products,
            rawResponse: JSON.stringify(result.object, null, 2),
            usage,
        };
        
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[AI SDK Extraction] ❌ Failed after ${duration}ms:`, error);
        throw error;
    }
}
