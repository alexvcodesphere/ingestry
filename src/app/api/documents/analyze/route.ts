import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractWithFallback, tableToArray, ExtractedTable } from "@/lib/azure/document-client";
import { extractWithGPT } from "@/lib/gpt/extraction-client";

export type ExtractionMethod = "azure" | "gpt";

function log(jobId: string, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Job: ${jobId}] ${message}`, data ?? "");
}

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    let jobId = "unknown";

    try {
        console.log("\n========== DOCUMENT ANALYSIS START ==========");

        const supabase = await createClient();

        // Check authentication
        log(jobId, "Checking authentication...");
        const {
            data: { user },
            error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
            log(jobId, "Authentication failed", authError);
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }
        log(jobId, `Authenticated as user: ${user.id}`);

        // Get form data
        const formData = await request.formData();
        const file = formData.get("pdf") as File | null;
        const catalogue = formData.get("catalogue") as string | null;
        const method = (formData.get("method") as ExtractionMethod) || "azure";

        if (!file) {
            log(jobId, "No PDF file provided");
            return NextResponse.json(
                { success: false, error: "No PDF file provided" },
                { status: 400 }
            );
        }
        log(jobId, `Received file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
        log(jobId, `Extraction method: ${method}`);

        // Create job record
        log(jobId, "Creating job record in database...");
        const { data: job, error: jobError } = await supabase
            .from("jobs")
            .insert({
                type: "pdf_extraction",
                status: "processing",
                input: { catalogue, fileName: file.name, fileSize: file.size, method },
                user_id: user.id,
            })
            .select()
            .single();

        if (jobError) {
            log(jobId, "Failed to create job record", jobError);
            return NextResponse.json(
                { success: false, error: `Failed to create job: ${jobError.message}` },
                { status: 500 }
            );
        }

        jobId = job.id;
        log(jobId, "Job record created successfully");

        // Update job status helper
        const updateJobStatus = async (status: string, error?: string, result?: unknown) => {
            log(jobId, `Updating job status to: ${status}`);
            const { error: updateError } = await supabase
                .from("jobs")
                .update({ status, error, result, updated_at: new Date().toISOString() })
                .eq("id", jobId);

            if (updateError) {
                log(jobId, `❌ Failed to update job status: ${updateError.message}`, updateError);
            } else {
                log(jobId, `✅ Job status updated to: ${status}`);
            }
        };

        // Upload PDF to storage
        log(jobId, "Converting file to buffer...");
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const storagePath = `${user.id}/${job.id}/${file.name}`;

        log(jobId, `Uploading to Supabase Storage: ${storagePath}`);
        const { error: uploadError } = await supabase.storage
            .from("pdfs")
            .upload(storagePath, fileBuffer, {
                contentType: "application/pdf",
            });

        if (uploadError) {
            log(jobId, "Storage upload warning (continuing anyway)", uploadError);
        } else {
            log(jobId, "File uploaded to storage successfully");
        }

        // Process document based on method
        let resultData: unknown;

        if (method === "gpt") {
            // GPT Vision extraction - send PDF directly
            log(jobId, "Starting GPT Vision extraction (direct PDF input)...");
            log(jobId, `OpenAI key: ${process.env.OPENAI_API_KEY ? "configured" : "NOT CONFIGURED"}`);

            try {
                const gptStartTime = Date.now();
                // Send PDF buffer directly to GPT Vision
                const gptResult = await extractWithGPT(fileBuffer);
                const gptDuration = Date.now() - gptStartTime;
                log(jobId, `GPT Vision extraction completed in ${gptDuration}ms`);
                log(jobId, `Extracted ${gptResult.products.length} products`);
                if (gptResult.usage) {
                    log(jobId, `Tokens used: ${gptResult.usage.totalTokens}`);
                }

                resultData = {
                    method: "gpt",
                    products: gptResult.products,
                    rawResponse: gptResult.rawResponse,
                    usage: gptResult.usage,
                    storagePath,
                };
            } catch (gptError) {
                const errorMessage = gptError instanceof Error ? gptError.message : "GPT extraction failed";
                log(jobId, "GPT extraction FAILED", gptError);

                await updateJobStatus("failed", errorMessage);

                return NextResponse.json(
                    { success: false, error: errorMessage, jobId },
                    { status: 500 }
                );
            }
        } else {
            // Azure-based extraction (default)
            log(jobId, "Starting Azure Document Intelligence extraction...");
            log(jobId, `Azure endpoint: ${process.env.AZURE_DOCUMENT_ENDPOINT ? "configured" : "NOT CONFIGURED"}`);
            log(jobId, `Azure key: ${process.env.AZURE_DOCUMENT_KEY ? "configured" : "NOT CONFIGURED"}`);

            let extractionResult;
            try {
                const azureStartTime = Date.now();
                extractionResult = await extractWithFallback(fileBuffer);
                const azureDuration = Date.now() - azureStartTime;
                log(jobId, `Azure extraction completed in ${azureDuration}ms`);
                log(jobId, `Found ${extractionResult.tables.length} tables, ${extractionResult.paragraphs?.length || 0} paragraphs, ${extractionResult.keyValuePairs?.length || 0} key-value pairs, ${extractionResult.pages} pages`);
            } catch (azureError) {
                const errorMessage = azureError instanceof Error ? azureError.message : "Azure extraction failed";
                log(jobId, "Azure extraction FAILED", azureError);

                await updateJobStatus("failed", errorMessage);

                return NextResponse.json(
                    { success: false, error: errorMessage, jobId },
                    { status: 500 }
                );
            }

            // Convert tables to array format
            log(jobId, "Converting tables to array format...");
            const tablesData = extractionResult.tables.map((table: ExtractedTable, idx: number) => {
                log(jobId, `  Table ${idx + 1}: ${table.rowCount} rows x ${table.columnCount} cols`);
                return {
                    rows: tableToArray(table),
                    rowCount: table.rowCount,
                    columnCount: table.columnCount,
                };
            });

            resultData = {
                method: "azure",
                tables: tablesData,
                text: extractionResult.text.slice(0, 10000),
                paragraphs: extractionResult.paragraphs,
                keyValuePairs: extractionResult.keyValuePairs,
                pages: extractionResult.pages,
                storagePath,
            };
        }

        // Update job with results
        log(jobId, "Updating job with results...");
        await updateJobStatus("completed", undefined, resultData);

        const totalDuration = Date.now() - startTime;
        log(jobId, `✅ Job completed successfully in ${totalDuration}ms`);
        console.log("========== DOCUMENT ANALYSIS END ==========\n");

        return NextResponse.json({
            success: true,
            jobId,
            method,
            data: resultData,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        log(jobId, "❌ Unexpected error", error);
        console.log("========== DOCUMENT ANALYSIS FAILED ==========\n");

        return NextResponse.json(
            { success: false, error: errorMessage, jobId },
            { status: 500 }
        );
    }
}
