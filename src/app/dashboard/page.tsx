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
    return <span className="tabular-nums">{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>;
}

// Duration display
function Duration({ start, end }: { start: Date; end: Date }) {
    const durationSecs = Math.floor((end.getTime() - start.getTime()) / 1000);
    const mins = Math.floor(durationSecs / 60);
    const secs = durationSecs % 60;
    return <span className="tabular-nums">{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>;
}

// Status badge component with more vibrant colors
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string; dotClass: string }> = {
        completed: {
            label: "Completed",
            className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
            dotClass: "bg-emerald-500"
        },
        failed: {
            label: "Failed",
            className: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20",
            dotClass: "bg-rose-500"
        },
        processing: {
            label: "Processing",
            className: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20",
            dotClass: "bg-amber-500 animate-pulse"
        },
        pending: {
            label: "Pending",
            className: "bg-slate-50 text-slate-600 ring-1 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-500/20",
            dotClass: "bg-slate-400"
        },
    };
    const cfg = config[status] || config.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
            {cfg.label}
        </span>
    );
}

// Stat card component for consistent styling
function StatCard({
    title,
    value,
    subtitle,
    icon,
    accentColor = "primary"
}: {
    title: string;
    value: number | string;
    subtitle: string;
    icon: string;
    accentColor?: "primary" | "success" | "warning" | "danger";
}) {
    const colorClasses = {
        primary: "from-primary/10 to-primary/5 text-primary",
        success: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
        warning: "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400",
        danger: "from-rose-500/10 to-rose-500/5 text-rose-600 dark:text-rose-400",
    };

    const iconBgClasses = {
        primary: "bg-primary/10 text-primary",
        success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };

    return (
        <Card className="relative card-hover overflow-hidden border-0 shadow-sm">
            <div className={`absolute inset-0 bg-gradient-to-br ${colorClasses[accentColor]} opacity-50`} />
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBgClasses[accentColor]}`}>
                    <span className="text-base">{icon}</span>
                </div>
            </CardHeader>
            <CardContent className="relative">
                <div className={`text-3xl font-bold tracking-tight ${colorClasses[accentColor].split(' ').pop()}`}>{value}</div>
                <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            </CardContent>
        </Card>
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
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
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
                    <p className="mt-1 text-muted-foreground">Process orders, validate products, push to shop systems</p>
                </div>
                <Link href="/dashboard/orders/new">
                    <Button className="gap-2 shadow-brand">
                        <span>＋</span>
                        New Order
                    </Button>
                </Link>
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Orders"
                    value={orderCount}
                    subtitle="Draft orders created"
                    icon="📦"
                    accentColor="primary"
                />
                <StatCard
                    title="Total Jobs"
                    value={jobs.length}
                    subtitle="Processing jobs"
                    icon="⚡"
                    accentColor="primary"
                />
                <StatCard
                    title="Completed"
                    value={completedCount}
                    subtitle="Successfully processed"
                    icon="✓"
                    accentColor="success"
                />
                <StatCard
                    title="Processing"
                    value={processingCount}
                    subtitle="Currently running"
                    icon="◎"
                    accentColor="warning"
                />
            </div>

            {/* Jobs Table */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 px-6">
                    <div>
                        <CardTitle className="text-lg">Recent Jobs</CardTitle>
                        <p className="text-sm text-muted-foreground">Your latest processing jobs</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                        <span className="text-xs">↻</span>
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    {jobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                                <span className="text-2xl">📄</span>
                            </div>
                            <p className="font-medium text-foreground">No jobs yet</p>
                            <p className="mt-1 text-sm text-muted-foreground">Upload an order to get started!</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="pl-6">Job ID</TableHead>
                                    <TableHead>File</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="pr-6">Duration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs.map((job) => {
                                    const createdAt = new Date(job.created_at);
                                    const updatedAt = job.updated_at ? new Date(job.updated_at) : new Date();
                                    const isRunning = job.status === "processing" || job.status === "pending";
                                    const fileName = (job.input as { fileName?: string })?.fileName;

                                    return (
                                        <TableRow key={job.id} className="group">
                                            <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                                                <span className="rounded bg-muted px-1.5 py-0.5">{job.id.slice(0, 8)}</span>
                                            </TableCell>
                                            <TableCell className="font-medium max-w-[200px] truncate">
                                                {fileName || "—"}
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">
                                                    {job.type.replace("_", " ")}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={job.status} />
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {createdAt.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="pr-6 text-sm text-muted-foreground">
                                                {isRunning ? (
                                                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                        <LiveTimer startTime={createdAt} />
                                                    </span>
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

