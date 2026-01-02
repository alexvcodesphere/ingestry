/**
 * Unified Extraction Interface
 * Delegates to the appropriate provider based on the selected model
 */

import { extractWithOpenAI } from './openai-client';
import { extractWithGemini } from './gemini-client';
import type { ExtractionResult, VisionModel, VISION_MODELS } from './types';

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
 * Extract products from PDF using the specified vision model
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt System prompt from processing profile
 * @param model Vision model to use (defaults to gpt-4o)
 */
export async function extractProducts(
    pdfBuffer: Buffer,
    systemPrompt: string,
    model: VisionModel = "gpt-4o"
): Promise<ExtractionResult> {
    console.log(`[Extraction] Using model: ${model}`);

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
