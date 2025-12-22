/**
 * GPT-based document extraction client
 * Uses OpenAI Responses API with direct PDF input for vision-based extraction
 */

export interface GPTExtractionResult {
    products: GPTExtractedProduct[];
    rawResponse: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Dynamic product type - fields come from processing profile
export type GPTExtractedProduct = Record<string, string>;

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

// Best model for vision-based extraction
const DEFAULT_MODEL = "gpt-4o";

// Improved system prompt for order confirmation extraction
const EXTRACTION_INSTRUCTIONS = `You are an expert at extracting product data from fashion brand order confirmations.

Your task is to extract ALL products from the provided order confirmation PDF and return them as a JSON object.

For each product, extract these fields (use empty string "" if not found, never null):
- name: Product name or description
- color: Color name exactly as shown (e.g., "Black", "Navy Blue", "NATURAL/OFF WHITE")
- size: Size exactly as shown (e.g., "S", "M", "L", "42", "ONE SIZE")
- price: Unit price with currency if present (e.g., "€250.00", "$180")
- quantity: Quantity ordered as string (e.g., "1", "2")
- ean: EAN/UPC/Barcode - 13-digit number if present
- sku: SKU or internal stock keeping unit code
- articleNumber: Article number or item number
- styleCode: Style code or style number (often starts with letters)
- designerCode: Designer/manufacturer reference code
- brand: Brand name if identifiable

Rules:
1. Each size/color combination = separate product entry
2. Include ALL products, even if some fields are missing
3. If a code could be multiple types, put it in the most specific field
4. Return only valid JSON, no explanation

Return format: {"products":[{"name":"","color":"","size":"","price":"","quantity":"","ean":"","sku":"","articleNumber":"","styleCode":"","designerCode":"","brand":""},...]}`;

/**
 * Extract products from PDF using GPT-4o Vision via Responses API
 * Sends the PDF directly as base64 - no conversion needed
 * @param pdfBuffer PDF file as Buffer
 * @param systemPrompt Optional custom system prompt from processing profile
 * @param options Additional options like model selection
 */
export async function extractWithGPT(
    pdfBuffer: Buffer,
    systemPrompt?: string,
    options: { model?: string } = {}
): Promise<GPTExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY not configured. Add it to .env.local");
    }

    const model = options.model || DEFAULT_MODEL;

    // Convert PDF to base64
    const base64Pdf = pdfBuffer.toString("base64");
    const pdfDataUri = `data:application/pdf;base64,${base64Pdf}`;

    console.log(`[GPT Vision] Using model: ${model}`);
    console.log(`[GPT Vision] PDF size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

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
        instructions: systemPrompt || EXTRACTION_INSTRUCTIONS,
        text: {
            format: {
                type: "json_object",
            },
        },
    };

    console.log(`[GPT Vision] Sending request to Responses API...`);

    const response = await fetch(OPENAI_RESPONSES_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    const duration = Date.now() - startTime;
    console.log(`[GPT Vision] API call took ${duration}ms`);

    if (!response.ok) {
        const error = await response.text();
        console.error("[GPT Vision] API error:", error);
        throw new Error(`GPT Vision API error: ${response.status} - ${error}`);
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

    console.log(`[GPT Vision] Raw response length: ${rawResponse.length}`);
    console.log(`[GPT Vision] Tokens used: ${usage?.totalTokens || "unknown"}`);
    console.log(`[GPT Vision] Response preview: ${rawResponse.substring(0, 200)}...`);

    // Parse the JSON response
    let products: GPTExtractedProduct[] = [];
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
            // Pass through all fields from GPT response dynamically
            const product: Record<string, string> = {};
            for (const [key, value] of Object.entries(p)) {
                product[key] = String(value || "");
            }
            return product;
        });
    } catch (parseError) {
        console.error("[GPT Vision] Failed to parse response:", parseError);
        console.error("[GPT Vision] Raw response:", rawResponse);
        throw new Error(`Failed to parse GPT response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    console.log(`[GPT Vision] ✅ Extracted ${products.length} products`);

    return { products, rawResponse, usage };
}
