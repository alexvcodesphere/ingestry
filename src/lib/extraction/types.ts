/**
 * Shared types for extraction clients
 */

/**
 * Uncertainty flag for a field that the AI is not 100% confident about.
 * Used in human-in-the-loop validation to highlight fields needing review.
 */
export interface NeedsCheckingFlag {
    field: string;
    reason: string;
}

/**
 * Product with metadata from AI extraction.
 * Separates the extracted data from uncertainty flags.
 */
export interface ExtractedProductWithMeta {
    data: Record<string, string>;
    needs_checking?: NeedsCheckingFlag[];
}

// Legacy alias for backward compatibility
export type ExtractedProduct = Record<string, string>;

export interface ExtractionResult {
    products: ExtractedProductWithMeta[];
    rawResponse: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export type VisionProvider = "openai" | "gemini";
export type VisionModel = "gpt-4o" | "gemini-3-flash" | "gemini-3-pro";

export const VISION_MODELS: Record<VisionModel, { provider: VisionProvider; label: string; description: string }> = {
    "gpt-4o": {
        provider: "openai",
        label: "GPT-4o",
        description: "OpenAI's most capable vision model",
    },
    "gemini-3-flash": {
        provider: "gemini",
        label: "Gemini 3 Flash",
        description: "Fast and cost-effective",
    },
    "gemini-3-pro": {
        provider: "gemini",
        label: "Gemini 3 Pro",
        description: "Highest accuracy for complex documents",
    },
};

export const DEFAULT_VISION_MODEL: VisionModel = "gemini-3-flash";

// Spark models for conversational data auditing (text-only reasoning)
// Using stable model identifiers from Gemini API
export type SparkModel = "gemini-3-flash-preview" | "gemini-2.5-flash" | "gemini-2.0-flash";

export const SPARK_MODELS: Record<SparkModel, { label: string; description: string }> = {
    "gemini-3-flash-preview": {
        label: "Gemini 3 Flash (Preview)",
        description: "Latest model, Pro-level intelligence",
    },
    "gemini-2.5-flash": {
        label: "Gemini 2.5 Flash",
        description: "Fast and highly capable",
    },
    "gemini-2.0-flash": {
        label: "Gemini 2.0 Flash",
        description: "Fastest, good for simple tasks",
    },
};

export const DEFAULT_SPARK_MODEL: SparkModel = "gemini-2.5-flash";
