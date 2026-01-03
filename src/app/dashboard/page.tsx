"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/ui/user-avatar";
import { PageHeader } from "@/components/layout";
import type { Job, TenantUserProfile } from "@/types";

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

// Status badge component
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

// Stat card component
function StatCard({
    title,
    value,
    icon,
    accentColor = "primary"
}: {
    title: string;
    value: number | string;
    icon: string;
    accentColor?: "primary" | "success" | "warning" | "danger";
}) {
    const colorClasses = {
        primary: "text-foreground",
        success: "text-emerald-600 dark:text-emerald-400",
        warning: "text-amber-600 dark:text-amber-400",
        danger: "text-rose-600 dark:text-rose-400",
    };

    const iconBgClasses = {
        primary: "bg-primary/10 text-primary",
        success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    };

    return (
        <Card className="py-4">
            <CardContent className="flex items-center gap-3 p-0 px-4">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClasses[accentColor]}`}>
                    <span className="text-sm">{icon}</span>
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                    <div className={`text-xl font-semibold tracking-tight ${colorClasses[accentColor]}`}>{value}</div>
                </div>
            </CardContent>
        </Card>
    );
}


export default function DashboardPage() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [totalJobs, setTotalJobs] = useState(0);
    const [orderCount, setOrderCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(10);
    const [members, setMembers] = useState<Record<string, TenantUserProfile>>({});

    const fetchData = useCallback(async () => {
        const supabase = createClient();
        const offset = page * pageSize;

        const [jobsResult, jobsCountResult, ordersResult] = await Promise.all([
            supabase
                .from("jobs")
                .select("*")
                .order("created_at", { ascending: false })
                .range(offset, offset + pageSize - 1),
            supabase.from("jobs").select("*", { count: "exact", head: true }),
            supabase.from("draft_orders").select("*", { count: "exact", head: true }),
        ]);

        if (jobsResult.data) setJobs(jobsResult.data);
        if (jobsCountResult.count !== null) setTotalJobs(jobsCountResult.count);
        if (ordersResult.count !== null) setOrderCount(ordersResult.count);
        setIsLoading(false);
    }, [page, pageSize]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Fetch tenant members for user info
    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const response = await fetch('/api/tenant/members');
                const result = await response.json();
                if (result.success && Array.isArray(result.data)) {
                    const memberMap = result.data.reduce((acc: Record<string, TenantUserProfile>, member: TenantUserProfile) => {
                        acc[member.user_id] = member;
                        return acc;
                    }, {});
                    setMembers(memberMap);
                }
            } catch (error) {
                console.error("Failed to fetch members:", error);
            }
        };
        fetchMembers();
    }, []);

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
    };

    const handlePageSizeChange = (newSize: number) => {
        setPageSize(newSize);
        setPage(0);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
            </div>
        );
    }

    const processingCount = jobs.filter((j) => j.status === "processing").length;
    const completedCount = jobs.filter((j) => j.status === "completed").length;

    const columns: Column<Job>[] = [
        {
            key: "id",
            header: "Job ID",
            render: (job) => (
                <span className="font-mono text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">{job.id.slice(0, 8)}</span>
                </span>
            ),
        },
        {
            key: "name",
            header: "Name",
            render: (job) => {
                const jobInput = job.input as { fileName?: string; orderName?: string };
                const displayName = jobInput?.orderName || jobInput?.fileName || "—";
                return <span className="font-medium max-w-[200px] truncate block">{displayName}</span>;
            },
        },
        {
            key: "type",
            header: "Type",
            render: (job) => (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium capitalize">
                    {job.type.replace("_", " ")}
                </span>
            ),
        },
        {
            key: "status",
            header: "Status",
            render: (job) => <StatusBadge status={job.status} />,
        },
        {
            key: "created_at",
            header: "Created",
            render: (job) => (
                <span className="text-sm text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                </span>
            ),
        },
        {
            key: "user",
            header: "User",
            render: (job) => <UserAvatar user={members[job.user_id]} />,
        },
        {
            key: "duration",
            header: "Duration",
            render: (job) => {
                const createdAt = new Date(job.created_at);
                const updatedAt = job.updated_at ? new Date(job.updated_at) : new Date();
                const isRunning = job.status === "processing" || job.status === "pending";
                return (
                    <span className="text-sm text-muted-foreground">
                        {isRunning ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <LiveTimer startTime={createdAt} />
                            </span>
                        ) : (
                            <Duration start={createdAt} end={updatedAt} />
                        )}
                    </span>
                );
            },
        },
        {
            key: "actions",
            header: "Actions",
            className: "text-right",
            render: (job) => {
                const jobResult = job.result as { draftOrderId?: string } | null;
                return jobResult?.draftOrderId ? (
                    <Link href={`/dashboard/orders/${jobResult.draftOrderId}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <span className="text-lg">→</span>
                        </Button>
                    </Link>
                ) : null;
            },
        },
    ];

    return (
        <div className="space-y-8">
            <PageHeader
                title="Dashboard"
                description="Process orders, validate products, push to shop systems"
                actions={
                    <Link href="/dashboard/orders/new">
                        <Button>New Order</Button>
                    </Link>
                }
            />

            {/* Stat Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard title="Total Jobs" value={totalJobs} icon="📋" />
                <StatCard title="Orders" value={orderCount} icon="📦" />
                <StatCard
                    title="Completed"
                    value={completedCount}
                    icon="✓"
                    accentColor="success"
                />
                <StatCard
                    title="Processing"
                    value={processingCount}
                    icon="⏳"
                    accentColor="warning"
                />
            </div>

            {/* Jobs Table */}
            <DataTable
                title="Recent Jobs"
                titleAction={
                    <Button variant="ghost" size="sm" onClick={fetchData} className="gap-1.5 h-8 text-muted-foreground hover:text-foreground">
                        <span className="text-xs">↻</span>
                        Refresh
                    </Button>
                }
                columns={columns}
                data={jobs}
                keyExtractor={(job) => job.id}
                isLoading={isLoading}
                emptyMessage="No jobs yet. Upload an order to get started!"
                page={page}
                pageSize={pageSize}
                total={totalJobs}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
            />
        </div>
    );
}
