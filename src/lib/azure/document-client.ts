import DocumentIntelligence, {
    AnalyzeResultOutput,
    getLongRunningPoller,
} from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";

const endpoint = process.env.AZURE_DOCUMENT_ENDPOINT;
const key = process.env.AZURE_DOCUMENT_KEY;

function getClient() {
    if (!endpoint || !key) {
        throw new Error("Azure Document Intelligence credentials not configured");
    }
    return DocumentIntelligence(endpoint, new AzureKeyCredential(key));
}

export interface ExtractedTable {
    rowCount: number;
    columnCount: number;
    cells: {
        rowIndex: number;
        columnIndex: number;
        content: string;
        kind?: string; // "columnHeader", "rowHeader", "content", "stubHead"
        columnSpan?: number;
        rowSpan?: number;
    }[];
}

export interface ExtractionResult {
    tables: ExtractedTable[];
    text: string;
    pages: number;
    paragraphs: { content: string; role?: string }[];
    keyValuePairs: { key: string; value: string; confidence: number }[];
}

// Available models - use prebuilt-invoice for order confirmations
export type DocumentModel =
    | "prebuilt-layout"      // Best for general documents with tables
    | "prebuilt-invoice"     // Best for invoices/order confirmations
    | "prebuilt-read"        // OCR only, fastest
    | "prebuilt-document";   // General document understanding

export interface ExtractionOptions {
    /** Which model to use (default: prebuilt-layout) */
    model?: DocumentModel;
    /** Extract specific pages only (e.g., "1-3,5") */
    pages?: string;
    /** Language hint for OCR (e.g., "en", "de") */
    locale?: string;
    /** Features to enable */
    features?: ("keyValuePairs" | "queryFields")[];
    /** Query fields to extract (requires queryFields feature) */
    queryFields?: string[];
}

/**
 * Extract tables and text from a PDF using Azure Document Intelligence
 */
export async function extractFromPdf(
    pdfBuffer: Buffer,
    options: ExtractionOptions = {}
): Promise<ExtractionResult> {
    const client = getClient();
    const model = options.model || "prebuilt-layout";

    console.log(`[Azure] Using model: ${model}`);
    console.log(`[Azure] Options:`, JSON.stringify(options, null, 2));

    // Build query parameters
    const queryParams: Record<string, string> = {};
    if (options.pages) queryParams.pages = options.pages;
    if (options.locale) queryParams.locale = options.locale;
    if (options.features?.length) queryParams.features = options.features.join(",");
    if (options.queryFields?.length) queryParams.queryFields = options.queryFields.join(",");

    // Start analysis
    const initialResponse = await client
        .path("/documentModels/{modelId}:analyze", model)
        .post({
            contentType: "application/octet-stream",
            body: pdfBuffer,
            queryParameters: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        });

    if (initialResponse.status !== "202") {
        const errorBody = initialResponse.body as { error?: { message?: string } };
        throw new Error(
            `Failed to start document analysis: ${initialResponse.status} - ${errorBody?.error?.message || "Unknown error"}`
        );
    }

    // Poll for completion
    const poller = getLongRunningPoller(client, initialResponse);
    const result = await poller.pollUntilDone();

    if (result.status !== "200") {
        throw new Error(`Document analysis failed: ${result.status}`);
    }

    const analyzeResult = result.body as { analyzeResult: AnalyzeResultOutput };
    const ar = analyzeResult.analyzeResult;

    // Extract tables with more detail
    const tables: ExtractedTable[] = (ar.tables || []).map((table) => ({
        rowCount: table.rowCount,
        columnCount: table.columnCount,
        cells: (table.cells || []).map((cell) => ({
            rowIndex: cell.rowIndex,
            columnIndex: cell.columnIndex,
            content: cell.content || "",
            kind: cell.kind,
            columnSpan: cell.columnSpan,
            rowSpan: cell.rowSpan,
        })),
    }));

    // Extract paragraphs with roles (titles, headers, footers, etc.)
    const paragraphs = (ar.paragraphs || []).map((p) => ({
        content: p.content || "",
        role: p.role,
    }));

    // Extract key-value pairs if available
    const keyValuePairs = (ar.keyValuePairs || []).map((kvp) => ({
        key: kvp.key?.content || "",
        value: kvp.value?.content || "",
        confidence: kvp.confidence || 0,
    }));

    // Full text
    const text = ar.content || "";
    const pages = ar.pages?.length || 0;

    console.log(`[Azure] Extracted: ${tables.length} tables, ${paragraphs.length} paragraphs, ${keyValuePairs.length} key-value pairs from ${pages} pages`);

    return { tables, text, pages, paragraphs, keyValuePairs };
}

/**
 * Convert extracted tables to a 2D array format
 */
export function tableToArray(table: ExtractedTable): string[][] {
    const result: string[][] = Array(table.rowCount)
        .fill(null)
        .map(() => Array(table.columnCount).fill(""));

    for (const cell of table.cells) {
        result[cell.rowIndex][cell.columnIndex] = cell.content;
    }

    return result;
}

/**
 * Try prebuilt-invoice model first (better for order confirmations),
 * fall back to prebuilt-layout if it fails
 */
export async function extractWithFallback(
    pdfBuffer: Buffer
): Promise<ExtractionResult> {
    try {
        // Try invoice model first - it's optimized for order docs
        console.log("[Azure] Trying prebuilt-invoice model...");
        return await extractFromPdf(pdfBuffer, { model: "prebuilt-invoice" });
    } catch (error) {
        console.log("[Azure] Invoice model failed, falling back to prebuilt-layout:", error);
        return await extractFromPdf(pdfBuffer, { model: "prebuilt-layout" });
    }
}
