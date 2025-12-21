"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { JobProgressBadge } from "@/components/processing-progress";
import type { Job } from "@/types";

export default function DashboardPage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [catalogueCount, setCatalogueCount] = useState(0);
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
    const [visibleRows, setVisibleRows] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const supabase = createClient();

        const [jobsResult, cataloguesResult] = await Promise.all([
            supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(10),
            supabase.from("catalogues").select("*", { count: "exact", head: true }),
        ]);

        if (jobsResult.data) setJobs(jobsResult.data);
        if (cataloguesResult.count !== null) setCatalogueCount(cataloguesResult.count);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        // Refresh every 5 seconds for processing jobs
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const toggleExpand = (jobId: string) => {
        setExpandedJobId(expandedJobId === jobId ? null : jobId);
        // Initialize visible rows for this job if not set
        if (!visibleRows[jobId]) {
            setVisibleRows(prev => ({ ...prev, [jobId]: 10 }));
        }
    };

    const showMoreRows = (jobId: string, total: number) => {
        setVisibleRows(prev => ({
            ...prev,
            [jobId]: Math.min((prev[jobId] || 10) + 20, total)
        }));
    };

    const getStatusBadge = (status: string) => {
        const classes = {
            completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
            failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
            processing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
            pending: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
        };
        return classes[status as keyof typeof classes] || classes.pending;
    };

    const renderJobResult = (job: Job) => {
        if (!job.result) return <p className="text-muted-foreground">No results</p>;

        const result = job.result as {
            method?: string;
            tables?: { rows: string[][]; rowCount: number; columnCount: number }[];
            pages?: number;
            products?: { name: string; color: string; size: string; price: string; quantity: string; ean: string; sku: string; articleNumber: string; styleCode: string; designerCode: string; brand: string }[];
            rawResponse?: string;
        };

        // GPT Results
        if (result.method === "gpt" && result.products && result.products.length > 0) {
            const currentVisible = visibleRows[job.id] || 20;
            const hasMore = result.products.length > currentVisible;

            return (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {result.products.length} product(s) extracted via GPT
                        </p>
                        {result.rawResponse && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    navigator.clipboard.writeText(result.rawResponse || "");
                                    alert("Copied to clipboard!");
                                }}
                            >
                                📋 Copy JSON
                            </Button>
                        )}
                    </div>
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
                                {result.products.slice(0, currentVisible).map((product, idx) => (
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
                                {hasMore && (
                                    <TableRow>
                                        <TableCell colSpan={11} className="text-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => showMoreRows(job.id, result.products!.length)}
                                                className="w-full"
                                            >
                                                Load More ({result.products.length - currentVisible} remaining)
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            );
        }

        // Azure Results
        if (result.tables && result.tables.length > 0) {
            return (
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Extracted {result.tables.length} table(s) from {result.pages} page(s)
                    </p>
                    {result.tables.map((table, tableIdx) => (
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
        }

        return <p className="text-muted-foreground">No data extracted</p>;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">Process orders, match catalogues, upload products</p>
                </div>
                {jobs.filter(j => j.status === "processing").length > 0 && (
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                        <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        {jobs.filter(j => j.status === "processing").length} active
                    </div>
                )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Catalogues</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{catalogueCount}</div>
                        <p className="text-xs text-muted-foreground">Supplier catalogues uploaded</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{jobs.length}</div>
                        <p className="text-xs text-muted-foreground">Processing jobs</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Completed</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                            {jobs.filter((j) => j.status === "completed").length}
                        </div>
                        <p className="text-xs text-muted-foreground">Successfully processed</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Processing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">
                            {jobs.filter((j) => j.status === "processing").length}
                        </div>
                        <p className="text-xs text-muted-foreground">Currently running</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Jobs</CardTitle>
                    <Button variant="ghost" size="sm" onClick={fetchData}>
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <p className="text-muted-foreground">No jobs yet. Upload a PDF to get started!</p>
                    ) : (
                        <div className="space-y-2">
                            {jobs.map((job) => {
                                // Calculate job duration
                                const createdAt = new Date(job.created_at);
                                const endTime = job.updated_at ? new Date(job.updated_at) : new Date();
                                const durationMs = endTime.getTime() - createdAt.getTime();
                                const durationSecs = Math.floor(durationMs / 1000);
                                const mins = Math.floor(durationSecs / 60);
                                const secs = durationSecs % 60;
                                const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                                return (
                                    <div key={job.id} className="rounded-lg border">
                                        <div
                                            className="flex cursor-pointer items-center justify-between p-4 hover:bg-muted/50"
                                            onClick={() => toggleExpand(job.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-lg text-muted-foreground">{expandedJobId === job.id ? "▼" : "▶"}</span>
                                                <div>
                                                    <p className="font-medium">
                                                        {(job.input as { fileName?: string })?.fileName || job.type}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{new Date(job.created_at).toLocaleString()}</span>
                                                        <span>•</span>
                                                        <span>
                                                            ⏱ {durationStr}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <JobProgressBadge status={job.status as "pending" | "processing" | "completed" | "failed"} />
                                        </div>
                                        {expandedJobId === job.id && (
                                            <div className="border-t bg-muted/30 p-4">
                                                {job.error ? (
                                                    <p className="text-sm text-red-500">Error: {job.error}</p>
                                                ) : (
                                                    renderJobResult(job)
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
