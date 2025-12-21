"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ProcessingProgress, type ProcessingStep } from "@/components/processing-progress";

type ExtractionMethod = "azure" | "gpt";

interface GPTProduct {
    name: string;
    color: string;
    size: string;
    price: string;
    quantity: string;
    ean: string;
    sku: string;
    articleNumber: string;
    styleCode: string;
    designerCode: string;
    brand: string;
}

interface ExtractionResult {
    method: ExtractionMethod;
    // Azure results
    tables?: { rows: string[][]; rowCount: number; columnCount: number }[];
    pages?: number;
    // GPT results
    products?: GPTProduct[];
    rawResponse?: string;
}

export default function OrdersPage() {
    const [file, setFile] = useState<File | null>(null);
    const [catalogue, setCatalogue] = useState("");
    const [method, setMethod] = useState<ExtractionMethod>("azure");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<ExtractionResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [steps, setSteps] = useState<ProcessingStep[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (isLoading) {
            const startTime = Date.now();
            timerRef.current = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 100);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isLoading]);

    const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile?.type === "application/pdf") {
            setFile(droppedFile);
            setError(null);
        } else {
            setError("Please drop a PDF file");
        }
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setError(null);
        }
    }, []);

    const updateStep = (name: string, status: ProcessingStep["status"], message?: string) => {
        setSteps((prev) => {
            const existing = prev.find((s) => s.name === name);
            if (existing) {
                return prev.map((s) => (s.name === name ? { ...s, status, message } : s));
            }
            return [...prev, { name, status, message }];
        });
    };

    const handleSubmit = async () => {
        if (!file) {
            setError("Please select a PDF file");
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        setElapsedTime(0);
        setSteps([]);

        updateStep("Uploading file", "running");

        try {
            const formData = new FormData();
            formData.append("pdf", file);
            formData.append("catalogue", catalogue);
            formData.append("method", method);

            updateStep("Uploading file", "done");
            updateStep(`Extracting with ${method.toUpperCase()}`, "running");

            const response = await fetch("/api/documents/analyze", {
                method: "POST",
                body: formData,
            });

            updateStep(`Extracting with ${method.toUpperCase()}`, "done");
            updateStep("Processing response", "running");

            const data = await response.json();

            if (data.success) {
                console.log("[Orders] API response success:", data);
                console.log("[Orders] Setting result to:", data.data);
                updateStep("Processing response", "done");
                const resultInfo = method === "gpt"
                    ? `Found ${data.data.products?.length || 0} products`
                    : `Found ${data.data.tables?.length || 0} tables`;
                updateStep("Complete", "done", resultInfo);
                setResult(data.data);
            } else {
                updateStep("Processing response", "error", data.error);
                setError(data.error || "Failed to process document");
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            updateStep("Processing response", "error", errorMsg);
            setError(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    const renderGPTResults = (products: GPTProduct[]) => (
        <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
                <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                        <TableHead>Brand</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>EAN</TableHead>
                        <TableHead>Article #</TableHead>
                        <TableHead>Style Code</TableHead>
                        <TableHead>Designer Code</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {products.map((product, idx) => (
                        <TableRow key={idx}>
                            <TableCell className="text-xs">{product.brand || "-"}</TableCell>
                            <TableCell className="font-medium">{product.name}</TableCell>
                            <TableCell>{product.color}</TableCell>
                            <TableCell>{product.size}</TableCell>
                            <TableCell>{product.price}</TableCell>
                            <TableCell>{product.quantity}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{product.sku || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{product.ean || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{product.articleNumber || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{product.styleCode || "-"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{product.designerCode || "-"}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );

    const renderAzureResults = (tables: { rows: string[][]; rowCount: number; columnCount: number }[]) => (
        <div className="space-y-4">
            {tables.map((table, tableIdx) => (
                <div key={tableIdx} className="rounded-lg border">
                    <div className="bg-muted px-3 py-2 text-sm font-medium">
                        Table {tableIdx + 1} ({table.rowCount} rows × {table.columnCount} cols)
                    </div>
                    <div className="max-h-64 overflow-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {table.rows[0]?.map((cell, cellIdx) => (
                                        <TableHead key={cellIdx} className="whitespace-nowrap">
                                            {cell || `Col ${cellIdx + 1}`}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {table.rows.slice(1, 11).map((row, rowIdx) => (
                                    <TableRow key={rowIdx}>
                                        {row.map((cell, cellIdx) => (
                                            <TableCell key={cellIdx} className="whitespace-nowrap">
                                                {cell}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                                {table.rows.length > 11 && (
                                    <TableRow>
                                        <TableCell colSpan={table.rows[0]?.length || 1} className="text-center text-muted-foreground">
                                            ... and {table.rows.length - 11} more rows
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Order Processing</h2>
                <p className="text-muted-foreground">
                    Upload order confirmation PDFs to extract product data
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Upload PDF</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Extraction Method Switcher */}
                    <div className="space-y-2">
                        <Label>Extraction Method</Label>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant={method === "azure" ? "default" : "outline"}
                                onClick={() => setMethod("azure")}
                                className="flex-1"
                            >
                                🔷 Azure Document Intelligence
                            </Button>
                            <Button
                                type="button"
                                variant={method === "gpt" ? "default" : "outline"}
                                onClick={() => setMethod("gpt")}
                                className="flex-1"
                            >
                                🤖 GPT-4 Extraction
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {method === "azure"
                                ? "Uses Azure's prebuilt document models. Best for structured tables."
                                : "Uses GPT-4 for intelligent extraction. Better for complex layouts but costs per API call."}
                        </p>
                    </div>

                    <div
                        onDrop={handleFileDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 hover:border-muted-foreground/50"
                    >
                        {file ? (
                            <div className="text-center">
                                <p className="font-medium">{file.name}</p>
                                <p className="text-sm text-muted-foreground">
                                    {(file.size / 1024).toFixed(1)} KB
                                </p>
                                <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="mt-2">
                                    Remove
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-muted-foreground">Drag and drop a PDF here, or click to select</p>
                                <Input type="file" accept=".pdf" onChange={handleFileSelect} className="mt-4 max-w-xs" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="catalogue">Catalogue Name (optional)</Label>
                        <Input
                            id="catalogue"
                            value={catalogue}
                            onChange={(e) => setCatalogue(e.target.value)}
                            placeholder="e.g., Acne Studios"
                        />
                    </div>

                    {error && <p className="text-sm text-red-500">{error}</p>}

                    <Button onClick={handleSubmit} disabled={!file || isLoading}>
                        {isLoading ? "Processing..." : `Extract with ${method.toUpperCase()}`}
                    </Button>
                </CardContent>
            </Card>

            {/* Processing Status */}
            {(isLoading || steps.length > 0) && (
                <Card>
                    <CardHeader>
                        <CardTitle>Processing Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ProcessingProgress
                            steps={steps}
                            elapsedTime={elapsedTime}
                            isLoading={isLoading}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Results */}
            {result && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Extraction Results ({result.method?.toUpperCase()})</span>
                            <span className="text-sm font-normal text-muted-foreground">
                                {result.method === "gpt"
                                    ? `${result.products?.length || 0} products`
                                    : `${result.tables?.length || 0} tables, ${result.pages || 0} pages`}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            console.log("[Orders] Rendering result:", result);
                            console.log("[Orders] method:", result.method, "products:", result.products?.length, "tables:", result.tables?.length);

                            if (result.method === "gpt" && result.products && result.products.length > 0) {
                                return renderGPTResults(result.products);
                            } else if (result.tables && result.tables.length > 0) {
                                return renderAzureResults(result.tables);
                            } else {
                                return <p className="text-muted-foreground">No data extracted</p>;
                            }
                        })()}

                        {/* Raw Response Section */}
                        {result.method === "gpt" && (
                            <div className="mt-6 space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Raw JSON Response</Label>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const jsonText = result.rawResponse || JSON.stringify(result.products, null, 2);
                                            navigator.clipboard.writeText(jsonText);
                                            alert("Copied to clipboard!");
                                        }}
                                    >
                                        📋 Copy JSON
                                    </Button>
                                </div>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-4 text-xs">
                                    {result.rawResponse || JSON.stringify(result.products, null, 2)}
                                </pre>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
