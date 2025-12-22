"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
import type { Job } from "@/types";

// Live timer component that updates every second
function LiveTimer({ startTime }: { startTime: Date }) {
    const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startTime.getTime()) / 1000));

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return <span>{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>;
}

// Duration display
function Duration({ start, end }: { start: Date; end: Date }) {
    const durationSecs = Math.floor((end.getTime() - start.getTime()) / 1000);
    const mins = Math.floor(durationSecs / 60);
    const secs = durationSecs % 60;
    return <span>{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        completed: { label: "Completed", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
        failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
        processing: { label: "Processing", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
        pending: { label: "Pending", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
    };
    const cfg = config[status] || config.pending;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
            {status === "processing" && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
            {cfg.label}
        </span>
    );
}

export default function DashboardPage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [orderCount, setOrderCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        const supabase = createClient();

        const [jobsResult, ordersResult] = await Promise.all([
            supabase.from("jobs").select("*").order("created_at", { ascending: false }).limit(20),
            supabase.from("draft_orders").select("*", { count: "exact", head: true }),
        ]);

        if (jobsResult.data) setJobs(jobsResult.data);
        if (ordersResult.count !== null) setOrderCount(ordersResult.count);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
        // Refresh every 5 seconds for processing jobs
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    const processingCount = jobs.filter((j) => j.status === "processing").length;
    const completedCount = jobs.filter((j) => j.status === "completed").length;
    const failedCount = jobs.filter((j) => j.status === "failed").length;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground">Process orders, validate products, push to shop systems</p>
                </div>
                <Link href="/dashboard/orders/new">
                    <Button>New Order</Button>
                </Link>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{orderCount}</div>
                        <p className="text-xs text-muted-foreground">Draft orders created</p>
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
                        <div className="text-2xl font-bold text-green-600">{completedCount}</div>
                        <p className="text-xs text-muted-foreground">Successfully processed</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Processing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-yellow-600">{processingCount}</div>
                        <p className="text-xs text-muted-foreground">Currently running</p>
                    </CardContent>
                </Card>
            </div>

            {/* Jobs Table */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Jobs</CardTitle>
                    <Button variant="ghost" size="sm" onClick={fetchData}>
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {jobs.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">
                            No jobs yet. Upload an order to get started!
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job ID</TableHead>
                                    <TableHead>File</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead>Duration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map((job) => {
                                    const createdAt = new Date(job.created_at);
                                    const updatedAt = job.updated_at ? new Date(job.updated_at) : new Date();
                                    const isRunning = job.status === "processing" || job.status === "pending";
                                    const fileName = (job.input as { fileName?: string })?.fileName;

                                    return (
                                        <TableRow key={job.id}>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {job.id.slice(0, 8)}
                                            </TableCell>
                                            <TableCell className="font-medium max-w-[200px] truncate">
                                                {fileName || "-"}
                                            </TableCell>
                                            <TableCell className="capitalize text-sm">
                                                {job.type.replace("_", " ")}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={job.status} />
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {createdAt.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-sm tabular-nums">
                                                {isRunning ? (
                                                    <LiveTimer startTime={createdAt} />
                                                ) : (
                                                    <Duration start={createdAt} end={updatedAt} />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
