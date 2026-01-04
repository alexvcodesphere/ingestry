/**
 * Profile Guesser - AI-powered schema suggestion
 * Uses Gemini to analyze sample documents and suggest field definitions
 */

import { GoogleGenAI } from "@google/genai";
import type { FieldDefinition } from "@/types";

const MODEL = "gemini-2.0-flash";

const SYSTEM_PROMPT = `You are an expert at analyzing order confirmation documents (PDFs, invoices, purchase orders).
Your task is to identify all extractable data fields from the document and suggest a schema.

For each field you identify, provide:
- key: A unique lowercase identifier with underscores (e.g., "product_name", "unit_price")
- label: A human-readable label (e.g., "Product Name", "Unit Price")
- type: One of "text", "number", "currency", or "enum"
  - Use "currency" for prices, costs, totals
  - Use "number" for quantities, counts, percentages
  - Use "enum" for fields with limited options (e.g., sizes like S/M/L/XL)
  - Use "text" for everything else

Focus on product-level data fields that appear for each line item, such as:
- Product identifiers (SKU, article number, EAN)
- Product details (name, description, brand, color, size)
- Quantities and pricing (quantity, unit price, total price)
- Any other relevant attributes

Return a JSON array of field definitions, ordered by importance/frequency in the document.
Do NOT include document-level fields like order number or customer info unless they appear per line item.`;

export interface SuggestedField {
    key: string;
    label: string;
    type: "text" | "number" | "currency" | "enum";
}

/**
 * Analyze a document and suggest intake schema fields
 * @param documentBuffer PDF or image buffer
 * @param mimeType MIME type of the document
 * @returns Array of suggested field definitions
 */
export async function suggestProfileFromDocument(
    documentBuffer: Buffer,
    mimeType: string = "application/pdf"
): Promise<FieldDefinition[]> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = documentBuffer.toString("base64");

    console.log(`[Profile Guesser] Analyzing document (${(documentBuffer.length / 1024).toFixed(1)} KB)`);
    const startTime = Date.now();

    const response = await ai.models.generateContent({
        model: MODEL,
        contents: [
            {
                role: "user",
                parts: [
                    {
                        inlineData: {
                            mimeType,
                            data: base64Data,
                        },
                    },
                    {
                        text: "Analyze this order document and suggest a schema for extracting product data. Return only the JSON array.",
                    },
                ],
            },
        ],
        config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
        },
    });

    const duration = Date.now() - startTime;
    console.log(`[Profile Guesser] Analysis completed in ${duration}ms`);

    const rawResponse = response.text || "[]";
    
    // Parse and validate response
    let suggestedFields: SuggestedField[];
    try {
        let cleaned = rawResponse.trim();
        if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
        if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
        if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
        
        suggestedFields = JSON.parse(cleaned.trim());
        
        if (!Array.isArray(suggestedFields)) {
            throw new Error("Response is not an array");
        }
    } catch (parseError) {
        console.error("[Profile Guesser] Failed to parse response:", rawResponse);
        throw new Error("Failed to parse AI response");
    }

    // Convert to FieldDefinition format
    const fields: FieldDefinition[] = suggestedFields.map((f) => ({
        key: f.key || "",
        label: f.label || "",
        type: f.type || "text",
        required: false,
        source: "extracted" as const,
    }));

    console.log(`[Profile Guesser] Suggested ${fields.length} fields`);
    return fields;
}
