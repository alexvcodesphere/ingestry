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
import type { FieldConfig } from "./prompt-builder";

// Fast model for intent parsing (minimal latency)
const INTENT_MODEL = "gemini-2.0-flash";

/** Single patch operation targeting one line item */
export interface SparkPatch {
    id: string;
    updates: Record<string, unknown>;
    previous_data: Record<string, unknown>;
}

export type SparkStatus = "success" | "ambiguous" | "no_changes" | "question" | "recalculate";

/** Response from Spark */
export interface SparkResult {
    status: SparkStatus;
    patches: SparkPatch[];
    trigger_regeneration: boolean;
    summary: string;
    clarification_needed?: string;
    answer?: string;  // For question mode responses
    fieldKeys?: string[]; // For recalculate status - which fields to regenerate
    matchingIds?: string[]; // For filtered recalculate - which items match the condition
}

export interface SparkOptions {
    model?: SparkModel;
    catalogGuide?: string;
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    allowQuestions?: boolean;  // Opt-in for question answering mode
    fields?: FieldConfig[]; // Rich field metadata
}

/** Result from intent parsing phase */
interface IntentResult {
    targetFields: string[];
    contextFields: string[];  // Fields needed for filtering (e.g., name when "items with name X")
    allRows: boolean;
    isAmbiguous: boolean;
    isQuestion: boolean;  // True if user is asking about data, not modifying
    isConfirmation: boolean;  // True if user is confirming a previous suggestion
    isRecalculate: boolean;  // True if user wants to regenerate computed fields
    recalculateFields?: string[];  // Specific fields to recalculate (empty = all computed)
    filterCondition?: {  // Filter condition for targeted recalculation
        field: string;
        operator: 'equals' | 'contains' | 'startsWith' | 'endsWith';
        value: string;
    };
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
  "targetFields": ["field_key"],     // Fields that will be MODIFIED with specific values
  "contextFields": ["field_key"],    // Fields needed for FILTERING or ANSWERING
  "allRows": true,                   // false if targets specific items
  "isAmbiguous": false,
  "isQuestion": false,               // true if asking ABOUT data (count, list, check)
  "isConfirmation": false,           // true if user is confirming a previous suggestion
  "isRecalculate": false,            // ONLY true if user wants to REGENERATE computed fields FROM THEIR TEMPLATES
  "recalculateFields": [],           // specific computed field keys to recalculate (empty = all computed fields)
  "filterCondition": null,           // if targeting specific items, e.g. {"field": "size", "operator": "equals", "value": "42"}
  "clarificationNeeded": null
}


CRITICAL RULES:
1. MODIFICATIONS (isRecalculate=false): "change X to Y", "set X to Y", "update X to Y", "make X be Y" - these SET a field to a specific value. Put the field in targetFields.
2. RECALCULATE (isRecalculate=true): ONLY when user ONLY says "recalculate", "regenerate", "recompute" without any value change - this REGENERATES computed fields from their templates.
3. COMPOUND INSTRUCTIONS: If instruction says "change X... and recalculate Y" or "set X... and then recalculate", this is a MODIFICATION. Put X in targetFields. IGNORE the "and recalculate" part - treat the whole instruction as a modification of X.
4. Confirmations like "yes", "do it", "apply that" → isConfirmation=true
5. Questions like "how many", "list", "show" → isQuestion=true
6. The word "recalculate" at the END of an instruction after "and" does NOT make it a recalculation if there's a modification before it.

Examples:
- "Set all years to 2025" → targetFields: ["year"], isRecalculate: false
- "Change season to winter" → targetFields: ["season"], isRecalculate: false  
- "Update all brands to Nike" → targetFields: ["brand"], isRecalculate: false
- "Change all seasons to winter and recalculate SKUs" → targetFields: ["season"], isRecalculate: false
- "Change the season to summer and recalculate their SKUs" → targetFields: ["season"], isRecalculate: false
- "Update season and then recalculate the article number" → targetFields: ["season"], isRecalculate: false
- "Recalculate the SKU" → targetFields: [], isRecalculate: true, recalculateFields: ["sku"]
- "Regenerate all computed fields" → isRecalculate: true, recalculateFields: []
- "Refresh SKU for items with size 42" → isRecalculate: true, recalculateFields: ["sku"], filterCondition: {"field": "size", "operator": "equals", "value": "42"}
- "How many items?" → isQuestion: true
- "Yes, do it" → isConfirmation: true`;

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
        
        // Validate fields exist in schema (case-insensitive matching)
        const schemaFields = Object.keys(fieldSchema);
        const fieldLookup = new Map(schemaFields.map(f => [f.toLowerCase(), f]));
        
        // Map AI-returned field names to actual schema field names (case-insensitive)
        const mapToSchemaField = (f: string) => fieldLookup.get(f.toLowerCase());
        const targetFields = (parsed.targetFields || [])
            .map(mapToSchemaField)
            .filter((f: string | undefined): f is string => f !== undefined);
        const contextFields = (parsed.contextFields || [])
            .map(mapToSchemaField)
            .filter((f: string | undefined): f is string => f !== undefined);

        console.log(`[Spark Intent] Target: ${targetFields.join(', ') || 'none'}, Context: ${contextFields.join(', ') || 'none'}, Question: ${parsed.isQuestion || false}, Confirmation: ${parsed.isConfirmation || false}, isRecalculate: ${parsed.isRecalculate || false}, recalculateFields: ${JSON.stringify(parsed.recalculateFields)}`);

        return {
            targetFields,
            contextFields,
            allRows: parsed.allRows !== false,
            isAmbiguous: parsed.isAmbiguous === true,
            isQuestion: parsed.isQuestion === true,
            isConfirmation: parsed.isConfirmation === true,
            isRecalculate: parsed.isRecalculate === true,
            recalculateFields: parsed.recalculateFields,
            filterCondition: parsed.filterCondition,
            clarificationNeeded: parsed.clarificationNeeded,
        };
    } catch (e) {
        console.error("[Spark Intent] Parse failed, using all fields:", e);
        return {
            targetFields: Object.keys(fieldSchema),
            contextFields: [],
            allRows: true,
            isAmbiguous: false,
            isQuestion: false,
            isConfirmation: false,
            isRecalculate: false,
        };
    }
}

/**
 * Build the system prompt for Spark patching
 */
function buildSparkPrompt(
    fieldSchema: Record<string, string>, 
    catalogGuide?: string,
    fields?: FieldConfig[]
): string {
    const schemaDoc = Object.entries(fieldSchema)
        .map(([key, label]) => `- ${key}: ${label}`)
        .join('\n');
    
    // Build template rules if fields provided
    let templateRules = "";
    if (fields) {
        const templatedFields = fields.filter(f => f.use_template && f.template);
        if (templatedFields.length > 0) {
            templateRules = "\n\n## Field Rules & Templates\nThe following fields are computed using strict templates. If the user asks to fix or regenerate these, you MUST follow these patterns:\n";
            for (const f of templatedFields) {
                templateRules += `- ${f.key}: MUST be formed as "${f.template}". variables like {brand.code} mean "look up the code for the brand".\n`;
            }
        }
    }

    let prompt = `You are Ingestry Spark. Generate precise patches for the records.

## Fields
${schemaDoc}${templateRules}

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
    console.log(`[Spark] Phase 1: Parsing intent for: "${instruction.substring(0, 50)}..."`);
    const intent = await parseIntent(instruction, fieldSchema, ai, options.conversationHistory);
    console.log(`[Spark] Intent result: isQuestion=${intent.isQuestion}, isConfirmation=${intent.isConfirmation}, isRecalculate=${intent.isRecalculate}, targetFields=[${intent.targetFields.join(',')}], contextFields=[${intent.contextFields.join(',')}]`);

    // Handle ambiguous intent early (but not if allowQuestions is on - let it try as a question)
    // IMPORTANT: Don't treat confirmations as ambiguous even without target fields
    if (intent.isAmbiguous && intent.targetFields.length === 0 && !intent.isQuestion && !intent.isConfirmation && !intent.isRecalculate && !options.allowQuestions) {
        return {
            status: "ambiguous",
            patches: [],
            trigger_regeneration: false,
            summary: "Could not determine which fields to modify",
            clarification_needed: intent.clarificationNeeded || "Which field would you like to change?",
        };
    }

    // RECALCULATE HANDLING:
    // If user wants to regenerate computed fields, return a recalculate status
    // The API route will handle the actual regeneration by calling line-items endpoint
    if (intent.isRecalculate) {
        console.log(`[Spark] Detected recalculate request for fields: ${intent.recalculateFields?.join(', ') || 'all computed'}`);
        
        // Apply filter condition if present to get matching item IDs
        let matchingIds: string[] | undefined;
        if (intent.filterCondition && !intent.allRows) {
            const { field, operator, value } = intent.filterCondition;
            const normalizedValue = value.toLowerCase().trim();
            
            matchingIds = lineItems
                .filter(item => {
                    const fieldValue = String(item.data[field] || '').toLowerCase().trim();
                    switch (operator) {
                        case 'equals':
                            return fieldValue === normalizedValue;
                        case 'contains':
                            return fieldValue.includes(normalizedValue);
                        case 'startsWith':
                            return fieldValue.startsWith(normalizedValue);
                        case 'endsWith':
                            return fieldValue.endsWith(normalizedValue);
                        default:
                            return fieldValue === normalizedValue;
                    }
                })
                .map(item => item.id);
            
            console.log(`[Spark] Filter applied: ${field} ${operator} "${value}" -> ${matchingIds.length} items matched`);
        }
        
        const summary = intent.recalculateFields?.length 
            ? `Recalculating ${intent.recalculateFields.join(', ')}${matchingIds ? ` for ${matchingIds.length} matching items` : ''}`
            : `Recalculating all computed fields${matchingIds ? ` for ${matchingIds.length} matching items` : ''}`;
        
        return {
            status: "recalculate",
            patches: [],
            trigger_regeneration: true,
            summary,
            fieldKeys: intent.recalculateFields,
            matchingIds,
        };
    }

    // CONFIRMATION HANDLING:
    // If user is confirming a previous suggestion, skip question mode and proceed to patching
    // The LLM will use conversation context to understand what changes to apply
    if (intent.isConfirmation) {
        console.log(`[Spark] Detected confirmation - proceeding to patch generation with conversation context`);
        // For confirmations, use ALL fields since we need to let the LLM figure out from context
        intent.targetFields = Object.keys(fieldSchema);
    }

    // ROBUST QUESTION DETECTION:
    // If allowQuestions is true AND no target fields detected, treat as a question
    // This handles cases where the LLM fails to set isQuestion=true
    // BUT: Skip this if user is confirming - confirmations are not questions
    const isEffectivelyQuestion = !intent.isConfirmation && (
        intent.isQuestion || 
        (options.allowQuestions && intent.targetFields.length === 0)
    );
    
    if (isEffectivelyQuestion) {
        console.log(`[Spark] Treating as question (explicit: ${intent.isQuestion}, fallback: ${options.allowQuestions && intent.targetFields.length === 0})`);
    }

    // Handle question detection
    if (isEffectivelyQuestion) {
        if (!options.allowQuestions) {
            // Question mode not enabled - prompt user to opt-in
            return {
                status: "question",
                patches: [],
                trigger_regeneration: false,
                summary: "This looks like a question about your data.",
                clarification_needed: "Enable question mode to analyze your data and answer questions.",
            };
        }

        // Question mode enabled - answer the question with ALL data
        // Don't filter fields for questions - we need full context to answer accurately
        console.log(`[Spark] Question mode: including all fields for accurate answers`);
        
        // For questions, use ALL fields - filtering causes the model to miss relevant data
        const fieldsToInclude = Object.keys(fieldSchema);

        const filteredItems = lineItems.map(item => {
            const filteredData: Record<string, unknown> = {};
            for (const key of fieldsToInclude) {
                if (key in item.data) {
                    filteredData[key] = item.data[key];
                }
            }
            return { id: item.id, data: filteredData };
        });

        // Build conversation history as readable text
        let conversationContext = "";
        if (options.conversationHistory && options.conversationHistory.length > 0) {
            conversationContext = "\n## Previous Conversation\n";
            for (const msg of options.conversationHistory) {
                const label = msg.role === "user" ? "User" : "Assistant";
                conversationContext += `${label}: ${msg.content}\n`;
            }
            console.log(`[Spark Question] Including ${options.conversationHistory.length} previous turns`);
        }

        // Build a more structured prompt for accurate answers
        const questionSystemPrompt = `You are a data analyst answering questions about a dataset.

RULES:
1. Count carefully - list items if needed to verify
2. For unique values, extract and list all distinct values
3. Answer the current question accurately based on the data provided
4. If asked about previous questions, refer to the conversation history above the data`;

        const questionUserPrompt = `${conversationContext}
## Dataset (${filteredItems.length} records)
Available fields: ${fieldsToInclude.join(', ')}

${JSON.stringify(filteredItems, null, 0)}

## Current Question
${instruction}

Provide an accurate answer based on the data above.`;

        const response = await ai.models.generateContent({
            model: options.model || INTENT_MODEL,
            contents: [{ role: "user", parts: [{ text: questionUserPrompt }] }],
            config: {
                systemInstruction: questionSystemPrompt,
            },
        });

        const answer = (response.text || "").trim();
        console.log(`[Spark] Question answered in ${Date.now() - totalStartTime}ms`);

        return {
            status: "question",
            patches: [],
            trigger_regeneration: false,
            summary: "Question answered",
            answer,
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

    // Filter fields metadata if provided
    const filteredFields = options.fields 
        ? options.fields.filter(f => fieldsToInclude.includes(f.key))
        : undefined;

    const systemPrompt = buildSparkPrompt(filteredSchema, options.catalogGuide, filteredFields);
    
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
