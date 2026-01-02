/**
 * Ingestry Spark Client
 * AI-powered data auditor using Gemini for natural language transformations.
 * 
 * Two-phase optimization:
 * 1. Intent Parser (fast model) - identifies target fields
 * 2. Patch Generator (main model) - generates patches with filtered data
 */

import { GoogleGenAI } from "@google/genai";
import { DEFAULT_SPARK_MODEL, type SparkModel } from "./types";

// Fast model for intent parsing (minimal latency)
const INTENT_MODEL = "gemini-2.0-flash";

/** Single patch operation targeting one line item */
export interface SparkPatch {
    id: string;
    updates: Record<string, unknown>;
    previous_data: Record<string, unknown>;
}

export type SparkStatus = "success" | "ambiguous" | "no_changes";

/** Response from Spark */
export interface SparkResult {
    status: SparkStatus;
    patches: SparkPatch[];
    trigger_regeneration: boolean;
    summary: string;
    clarification_needed?: string;
}

export interface SparkOptions {
    model?: SparkModel;
    catalogGuide?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

/** Result from intent parsing phase */
interface IntentResult {
    targetFields: string[];
    contextFields: string[];  // Fields needed for filtering (e.g., name when "items with name X")
    allRows: boolean;
    isAmbiguous: boolean;
    clarificationNeeded?: string;
}

/**
 * Phase 1: Parse user intent to identify target and context fields (fast model)
 */
async function parseIntent(
    instruction: string,
    fieldSchema: Record<string, string>,
    ai: GoogleGenAI,
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<IntentResult> {
    const schemaDoc = Object.entries(fieldSchema)
        .map(([key, label]) => `${key}: ${label}`)
        .join(', ');

    const prompt = `Analyze this instruction and identify which data fields are involved.

Fields: ${schemaDoc}

Instruction: "${instruction}"

Return JSON:
{
  "targetFields": ["field_key"],     // Fields that will be MODIFIED
  "contextFields": ["field_key"],    // Fields needed for FILTERING (e.g., "items with name X" needs name field)
  "allRows": true,                   // false if instruction targets specific items
  "isAmbiguous": false,
  "clarificationNeeded": null
}

Examples:
- "Set all years to 2025" → targetFields: ["year"], contextFields: [], allRows: true
- "Change year to 2025 for items named gloves" → targetFields: ["year"], contextFields: ["product_name"], allRows: false
- "Fix the names" → targetFields: ["product_name"], contextFields: [], allRows: true`;

    const startTime = Date.now();
    
    try {
        // Build contents with conversation history for context
        const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
        
        if (conversationHistory && conversationHistory.length > 0) {
            for (const msg of conversationHistory) {
                contents.push({
                    role: msg.role === "user" ? "user" : "model",
                    parts: [{ text: msg.content }],
                });
            }
        }
        contents.push({ role: "user", parts: [{ text: prompt }] });

        const response = await ai.models.generateContent({
            model: INTENT_MODEL,
            contents,
            config: { responseMimeType: "application/json" },
        });

        const duration = Date.now() - startTime;
        console.log(`[Spark Intent] Parsed in ${duration}ms`);

        const text = (response.text || "").trim();
        const parsed = JSON.parse(text.replace(/```json\n?|```/g, ''));
        
        // Validate fields exist in schema
        const validFields = new Set(Object.keys(fieldSchema));
        const targetFields = (parsed.targetFields || []).filter((f: string) => validFields.has(f));
        const contextFields = (parsed.contextFields || []).filter((f: string) => validFields.has(f));

        console.log(`[Spark Intent] Target: ${targetFields.join(', ') || 'none'}, Context: ${contextFields.join(', ') || 'none'}`);

        return {
            targetFields,
            contextFields,
            allRows: parsed.allRows !== false,
            isAmbiguous: parsed.isAmbiguous === true,
            clarificationNeeded: parsed.clarificationNeeded,
        };
    } catch (e) {
        console.error("[Spark Intent] Parse failed, using all fields:", e);
        // Fallback: use all fields
        return {
            targetFields: Object.keys(fieldSchema),
            contextFields: [],
            allRows: true,
            isAmbiguous: false,
        };
    }
}

/**
 * Build the system prompt for Spark patching
 */
function buildSparkPrompt(fieldSchema: Record<string, string>, catalogGuide?: string): string {
    const schemaDoc = Object.entries(fieldSchema)
        .map(([key, label]) => `- ${key}: ${label}`)
        .join('\n');
    
    let prompt = `You are Ingestry Spark. Generate precise patches for the records.

## Fields
${schemaDoc}

## Output Format
{"status": "success"|"ambiguous"|"no_changes", "patches": [{"id": "<id>", "updates": {"<field>": "<value>"}}], "trigger_regeneration": false, "summary": "description", "clarification_needed": "question if ambiguous"}

## Rules
1. Only use fields from schema
2. Return "ambiguous" if unclear
3. Set trigger_regeneration=true if changing brand/color/size/category
4. Valid JSON only`;

    if (catalogGuide) {
        prompt += `\n\n## Catalog\n${catalogGuide}`;
    }

    return prompt;
}

/**
 * Validate that patches only contain valid field keys
 */
function validatePatches(
    patches: Array<{ id: string; updates: Record<string, unknown> }>,
    validFields: Set<string>
): SparkPatch[] {
    return patches
        .map(patch => ({
            id: patch.id,
            updates: Object.fromEntries(
                Object.entries(patch.updates).filter(([key]) => validFields.has(key))
            ),
            previous_data: {},
        }))
        .filter(patch => Object.keys(patch.updates).length > 0);
}

/**
 * Two-phase Spark Audit
 * Phase 1: Parse intent (fast model) → identify target fields
 * Phase 2: Generate patches (main model) → filtered payload
 */
export async function sparkAudit(
    instruction: string,
    lineItems: Array<{ id: string; data: Record<string, unknown> }>,
    fieldSchema: Record<string, string>,
    options: SparkOptions = {}
): Promise<SparkResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const totalStartTime = Date.now();

    // Phase 1: Parse intent to get target fields (with conversation history for context)
    console.log(`[Spark] Phase 1: Parsing intent...`);
    const intent = await parseIntent(instruction, fieldSchema, ai, options.conversationHistory);

    // Handle ambiguous intent early
    if (intent.isAmbiguous && intent.targetFields.length === 0) {
        return {
            status: "ambiguous",
            patches: [],
            trigger_regeneration: false,
            summary: "Could not determine which fields to modify",
            clarification_needed: intent.clarificationNeeded || "Which field would you like to change?",
        };
    }

    // Determine which fields to include: target fields + context fields (for filtering)
    const allNeededFields = [...new Set([...intent.targetFields, ...intent.contextFields])];
    const fieldsToInclude = allNeededFields.length > 0 
        ? allNeededFields 
        : Object.keys(fieldSchema); // Fallback to all if no matches

    console.log(`[Spark] Fields to include: ${fieldsToInclude.join(', ')}`);

    // Phase 2: Filter data and generate patches
    const filteredItems = lineItems.map(item => {
        const filteredData: Record<string, unknown> = {};
        for (const key of fieldsToInclude) {
            if (key in item.data) {
                filteredData[key] = item.data[key];
            }
        }
        return { id: item.id, data: filteredData };
    });

    // Build filtered schema (include all fields so model understands structure)
    const filteredSchema: Record<string, string> = {};
    for (const key of fieldsToInclude) {
        if (key in fieldSchema) {
            filteredSchema[key] = fieldSchema[key];
        }
    }

    const systemPrompt = buildSparkPrompt(filteredSchema, options.catalogGuide);
    
    const userMessage = `## Data (${filteredItems.length} records)
${JSON.stringify(filteredItems)}

## Instruction
${instruction}`;

    console.log(`[Spark] Phase 2: Generating patches (${fieldsToInclude.length} fields, ${filteredItems.length} items)...`);
    const patchStartTime = Date.now();

    // Build contents array with conversation history for context
    const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
    
    // Add conversation history if present
    if (options.conversationHistory && options.conversationHistory.length > 0) {
        for (const msg of options.conversationHistory) {
            contents.push({
                role: msg.role === "user" ? "user" : "model",
                parts: [{ text: msg.content }],
            });
        }
        console.log(`[Spark] Including ${options.conversationHistory.length} previous turns for context`);
    }
    
    // Add current user message
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const response = await ai.models.generateContent({
        model: options.model || DEFAULT_SPARK_MODEL,
        contents,
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
        },
    });

    const patchDuration = Date.now() - patchStartTime;
    const totalDuration = Date.now() - totalStartTime;
    console.log(`[Spark] Phase 2 complete in ${patchDuration}ms (total: ${totalDuration}ms)`);

    const rawText = (response.text || "").trim();
    
    // Clean markdown fences if present
    let cleanedResponse = rawText;
    if (cleanedResponse.startsWith("```json")) {
        cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith("```")) {
        cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith("```")) {
        cleanedResponse = cleanedResponse.slice(0, -3);
    }

    try {
        const parsed = JSON.parse(cleanedResponse.trim());
        const validFields = new Set(Object.keys(fieldSchema));
        
        const status: SparkStatus = 
            parsed.status === "ambiguous" ? "ambiguous" :
            parsed.status === "no_changes" ? "no_changes" : "success";

        const validatedPatches = validatePatches(
            Array.isArray(parsed.patches) ? parsed.patches : [],
            validFields
        );
        
        console.log(`[Spark] Generated ${validatedPatches.length} patches, status: ${status}`);

        return {
            status,
            patches: validatedPatches,
            trigger_regeneration: Boolean(parsed.trigger_regeneration),
            summary: parsed.summary || `Processed ${validatedPatches.length} changes`,
            clarification_needed: parsed.clarification_needed,
        };
    } catch (e) {
        console.error("[Spark] Failed to parse response:", e);
        console.error("[Spark] Raw response:", rawText);
        throw new Error("Failed to parse Spark response");
    }
}
