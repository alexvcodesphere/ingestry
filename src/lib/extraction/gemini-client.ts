/**
 * Gemini Vision Extraction Client
 * Uses Google Gemini API with direct PDF input for vision-based extraction
 */

import { GoogleGenAI } from "@google/genai";
import type { ExtractionResult, ExtractedProductWithMeta, NeedsCheckingFlag } from './types';

// Available Gemini 3 models for vision
const DEFAULT_MODEL = "gemini-3-flash-preview";

/**
 * Extract products from PDF using Google Gemini Vision
 * Sends the PDF directly as base64 inline data
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt System prompt from processing profile (required)
 * @param options Additional options like model selection
 */
export async function extractWithGemini(
    pdfBuffer: Buffer,
    systemPrompt: string,
    options: { model?: string } = {}
): Promise<ExtractionResult> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured. Add it to .env.local");
    }

    if (!systemPrompt) {
        throw new Error("System prompt is required. Ensure a processing profile is configured.");
    }

    const model = options.model || DEFAULT_MODEL;
    const ai = new GoogleGenAI({ apiKey });

    // Convert PDF to base64
    const base64Pdf = pdfBuffer.toString("base64");

    console.log(`[Gemini Vision] Using model: ${model}`);
    console.log(`[Gemini Vision] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    const startTime = Date.now();

    console.log(`[Gemini Vision] Sending request...`);

    let response;
    try {
        response = await ai.models.generateContent({
            model,
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType: "application/pdf",
                                data: base64Pdf,
                            },
                        },
                        {
                            text: "Extract all products from this order confirmation PDF and return as JSON.",
                        },
                    ],
                },
            ],
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
            },
        });
    } catch (apiError) {
        const duration = Date.now() - startTime;
        console.error(`[Gemini Vision] ❌ API call failed after ${duration}ms`);
        console.error(`[Gemini Vision] Model: ${model}`);
        console.error(`[Gemini Vision] Error name:`, apiError instanceof Error ? apiError.name : 'Unknown');
        console.error(`[Gemini Vision] Error message:`, apiError instanceof Error ? apiError.message : String(apiError));
        console.error(`[Gemini Vision] Full error:`, JSON.stringify(apiError, null, 2));
        throw new Error(`Gemini API error (${model}): ${apiError instanceof Error ? apiError.message : String(apiError)}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[Gemini Vision] API call took ${duration}ms`);

    const rawResponse = response.text || "";

    // Extract usage if available
    const usageMetadata = response.usageMetadata;
    const usage = usageMetadata ? {
        promptTokens: usageMetadata.promptTokenCount || 0,
        completionTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0,
    } : undefined;

    console.log(`[Gemini Vision] Raw response length: ${rawResponse.length}`);
    console.log(`[Gemini Vision] Tokens used: ${usage?.totalTokens || "unknown"}`);
    console.log(`[Gemini Vision] Response preview: ${rawResponse.substring(0, 200)}...`);

    // Parse the JSON response
    let products: ExtractedProductWithMeta[] = [];
    try {
        // Clean the response (remove any markdown if present)
        let cleanedResponse = rawResponse.trim();
        if (cleanedResponse.startsWith("```json")) {
            cleanedResponse = cleanedResponse.slice(7);
        }
        if (cleanedResponse.startsWith("```")) {
            cleanedResponse = cleanedResponse.slice(3);
        }
        if (cleanedResponse.endsWith("```")) {
            cleanedResponse = cleanedResponse.slice(0, -3);
        }

        const parsed = JSON.parse(cleanedResponse.trim());

        // Handle both array format and object with products key
        const productArray = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.products)
                ? parsed.products
                : [];

        products = productArray.map((p: Record<string, unknown>) => {
            // Extract needs_checking array if present
            const needsChecking = Array.isArray(p.needs_checking) 
                ? (p.needs_checking as NeedsCheckingFlag[])
                : undefined;

            // Build data object from all other fields
            const data: Record<string, string> = {};
            for (const [key, value] of Object.entries(p)) {
                if (key !== 'needs_checking') {
                    data[key] = String(value || "");
                }
            }

            return { data, needs_checking: needsChecking };
        });
    } catch (parseError) {
        console.error("[Gemini Vision] Failed to parse response:", parseError);
        console.error("[Gemini Vision] Raw response:", rawResponse);
        throw new Error(`Failed to parse response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    console.log(`[Gemini Vision] ✅ Extracted ${products.length} products`);

    return { products, rawResponse, usage };
}
