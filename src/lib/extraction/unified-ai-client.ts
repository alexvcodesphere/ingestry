/**
 * Unified AI Client Configuration
 * Uses Vercel AI SDK 6 with Google Gemini provider
 * 
 * Central configuration for all AI model instances in the application.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Create the Google provider with API key from environment
const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Spark (Chat/Agent) Model
 * Uses Gemini 3 Flash for conversational interactions with tool calling.
 */
export const sparkModel = google('gemini-3-flash-preview');

/**
 * Extraction (Vision) Model
 * Optimized for processing PDFs and images.
 */
export const extractionModel = google('gemini-3-flash-preview');

/**
 * Intent Parsing Model
 * Fast model for quick classification tasks.
 */
export const intentModel = google('gemini-2.0-flash');

/**
 * Model configuration metadata for settings UI
 */
export const MODEL_CONFIG = {
    spark: {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        description: 'Pro-level intelligence with native tool calling',
    },
    extraction: {
        id: 'gemini-3-flash-preview',
        label: 'Gemini 3 Flash',
        description: 'Fast vision-based extraction',
    },
    intent: {
        id: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash',
        description: 'Ultra-fast intent classification',
    },
} as const;
