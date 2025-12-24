/**
 * OpenAI Vision Extraction Client
 * Uses OpenAI Responses API with direct PDF input for vision-based extraction
 */

import type { ExtractionResult, ExtractedProduct } from './types';

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

// Best model for vision-based extraction
const DEFAULT_MODEL = "gpt-4o";

/**
 * Extract products from PDF using OpenAI GPT-4o Vision via Responses API
 * Sends the PDF directly as base64 - no conversion needed
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt System prompt from processing profile (required)
 * @param options Additional options like model selection
 */
export async function extractWithOpenAI(
    pdfBuffer: Buffer,
    systemPrompt: string,
    options: { model?: string } = {}
): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY not configured. Add it to .env.local");
    }

    if (!systemPrompt) {
        throw new Error("System prompt is required. Ensure a processing profile is configured.");
    }

    const model = options.model || DEFAULT_MODEL;

    // Convert PDF to base64
    const base64Pdf = pdfBuffer.toString("base64");
    const pdfDataUri = `data:application/pdf;base64,${base64Pdf}`;

    console.log(`[OpenAI Vision] Using model: ${model}`);
    console.log(`[OpenAI Vision] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    const startTime = Date.now();

    // Correct Responses API format
    const requestBody = {
        model,
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_file",
                        filename: "order.pdf",
                        file_data: pdfDataUri,
                    },
                    {
                        type: "input_text",
                        text: "Extract all products from this order confirmation PDF and return as JSON.",
                    },
                ],
            },
        ],
        instructions: systemPrompt,
        text: {
            format: {
                type: "json_object",
            },
        },
    };

    console.log(`[OpenAI Vision] Sending request to Responses API...`);

    const response = await fetch(OPENAI_RESPONSES_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    const duration = Date.now() - startTime;
    console.log(`[OpenAI Vision] API call took ${duration}ms`);

    if (!response.ok) {
        const error = await response.text();
        console.error("[OpenAI Vision] API error:", error);
        throw new Error(`OpenAI Vision API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Extract the text output from the response
    const outputItem = data.output?.find((item: { type: string }) => item.type === "message");
    const textContent = outputItem?.content?.find((c: { type: string }) => c.type === "output_text");
    const rawResponse = textContent?.text || "";

    const usage = data.usage ? {
        promptTokens: data.usage.input_tokens || 0,
        completionTokens: data.usage.output_tokens || 0,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined;

    console.log(`[OpenAI Vision] Raw response length: ${rawResponse.length}`);
    console.log(`[OpenAI Vision] Tokens used: ${usage?.totalTokens || "unknown"}`);
    console.log(`[OpenAI Vision] Response preview: ${rawResponse.substring(0, 200)}...`);

    // Parse the JSON response
    let products: ExtractedProduct[] = [];
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
            // Pass through all fields from response dynamically
            const product: Record<string, string> = {};
            for (const [key, value] of Object.entries(p)) {
                product[key] = String(value || "");
            }
            return product;
        });
    } catch (parseError) {
        console.error("[OpenAI Vision] Failed to parse response:", parseError);
        console.error("[OpenAI Vision] Raw response:", rawResponse);
        throw new Error(`Failed to parse response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    console.log(`[OpenAI Vision] ✅ Extracted ${products.length} products`);

    return { products, rawResponse, usage };
}
