/**
 * Profile Guesser - AI-powered schema suggestion
 * Uses AI SDK v6 generateObject to analyze sample documents and suggest field definitions
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { extractionModel } from './unified-ai-client';
import type { FieldDefinition } from "@/types";

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

// Zod schema for suggested fields
const suggestedFieldSchema = z.object({
    key: z.string().describe('Unique lowercase identifier with underscores'),
    label: z.string().describe('Human-readable label'),
    type: z.enum(['text', 'number', 'currency', 'enum']).describe('Field type'),
});

const profileSuggestionSchema = z.object({
    fields: z.array(suggestedFieldSchema).describe('Array of suggested field definitions'),
});

export interface SuggestedField {
    key: string;
    label: string;
    type: "text" | "number" | "currency" | "enum";
}

/**
 * Analyze a document and suggest intake schema fields
 * @param documentBuffer PDF or image buffer
 * @param mimeType MIME type of the document
 * @param options Optional configuration (unused, kept for API compatibility)
 * @returns Array of suggested field definitions
 */
export async function suggestProfileFromDocument(
    documentBuffer: Buffer,
    mimeType: string = "application/pdf",
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: { model?: string } = {}
): Promise<FieldDefinition[]> {
    const base64Data = documentBuffer.toString("base64");

    console.log(`[Profile Guesser] Using AI SDK v6 with Gemini`);
    console.log(`[Profile Guesser] Analyzing document (${(documentBuffer.length / 1024).toFixed(1)} KB)`);
    const startTime = Date.now();

    try {
        const result = await generateObject({
            model: extractionModel,
            schema: profileSuggestionSchema,
            system: SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'file',
                            data: base64Data,
                            mediaType: mimeType,
                        },
                        {
                            type: 'text',
                            text: 'Analyze this order document and suggest a schema for extracting product data.',
                        },
                    ],
                },
            ],
        });

        const duration = Date.now() - startTime;
        console.log(`[Profile Guesser] Analysis completed in ${duration}ms`);

        // Convert to FieldDefinition format
        const fields: FieldDefinition[] = result.object.fields.map((f) => ({
            key: f.key || "",
            label: f.label || "",
            type: f.type || "text",
            required: false,
            source: "extracted" as const,
        }));

        console.log(`[Profile Guesser] Suggested ${fields.length} fields`);
        return fields;
    } catch (error) {
        console.error("[Profile Guesser] Error:", error);
        throw new Error("Failed to analyze document with AI");
    }
}
