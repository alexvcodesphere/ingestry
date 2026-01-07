/**
 * Unified Extraction Interface
 * Delegates to the appropriate provider based on the selected model
 * 
 * Supports two extraction modes:
 * 1. Legacy mode: Uses provider-specific clients (openai-client, gemini-client)
 * 2. AI SDK mode: Uses generateObject with Zod schemas when fields are provided
 */

import { extractWithOpenAI } from './openai-client';
import { extractWithGemini } from './gemini-client';
import { extractWithAISDK, type FieldConfig } from './ai-sdk-extraction';
import type { ExtractionResult, VisionModel } from './types';

export { 
    type ExtractionResult, 
    type ExtractedProduct, 
    type ExtractedProductWithMeta, 
    type NeedsCheckingFlag, 
    type VisionModel, 
    type VisionProvider, 
    VISION_MODELS,
    DEFAULT_VISION_MODEL,
    type SparkModel,
    SPARK_MODELS,
    DEFAULT_SPARK_MODEL,
} from './types';
export { getPromptForProfile, type PromptOptions } from './prompt-builder';
export type { ProcessingProfile } from './prompt-builder';

/**
 * Field configuration for AI SDK extraction mode
 * (re-exported for convenience)
 */
export type ExtractionFieldConfig = FieldConfig;

/**
 * Extraction options
 */
interface ExtractProductsOptions {
    /** Profile fields for AI SDK mode with Zod schema generation */
    fields?: ExtractionFieldConfig[];
    /** Force legacy extraction mode (ignores fields even if provided) */
    forceLegacy?: boolean;
}

/**
 * Extract products from PDF using the specified vision model
 * 
 * Two modes:
 * - AI SDK mode (recommended): Pass `options.fields` to use generateObject with Zod schemas
 * - Legacy mode: Omit `options.fields` to use direct provider calls
 * 
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt System prompt from processing profile
 * @param model Vision model to use (defaults to gemini-3-flash)
 * @param options Additional extraction options
 */
export async function extractProducts(
    pdfBuffer: Buffer,
    systemPrompt: string,
    model: VisionModel = "gemini-3-flash",
    options?: ExtractProductsOptions
): Promise<ExtractionResult> {
    const { fields, forceLegacy } = options || {};
    
    // Use AI SDK mode if fields are provided and not forcing legacy
    if (fields && fields.length > 0 && !forceLegacy) {
        console.log(`[Extraction] Using AI SDK v6 mode with ${fields.length} fields`);
        return extractWithAISDK(pdfBuffer, systemPrompt, fields, model);
    }
    
    // Legacy mode: direct provider calls
    console.log(`[Extraction] Using legacy mode with model: ${model}`);

    switch (model) {
        case "gpt-4o":
            return extractWithOpenAI(pdfBuffer, systemPrompt, { model: "gpt-4o" });

        case "gemini-3-flash":
            return extractWithGemini(pdfBuffer, systemPrompt, { model: "gemini-3-flash-preview" });

        case "gemini-3-pro":
            return extractWithGemini(pdfBuffer, systemPrompt, { model: "gemini-3-pro-preview" });

        default:
            throw new Error(`Unknown vision model: ${model}`);
    }
}
