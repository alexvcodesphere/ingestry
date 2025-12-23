"use client";

import { cn } from "@/lib/utils";

export interface ProcessingStep {
    name: string;
    status: "pending" | "running" | "done" | "error";
    message?: string;
}

interface ProcessingProgressProps {
    steps: ProcessingStep[];
    elapsedTime?: number;
    isLoading?: boolean;
    className?: string;
}

/**
 * Shared processing progress component with step indicators and optional progress bar
 * Used in both Orders page (during extraction) and Dashboard (for job status)
 */
export function ProcessingProgress({
    steps,
    elapsedTime,
    isLoading = false,
    className,
}: ProcessingProgressProps) {
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    // Calculate progress percentage (available for future progress bar UI)
    const completedSteps = steps.filter((s) => s.status === "done").length;
    const totalSteps = steps.length;
    const _progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    // Determine overall status
    const hasError = steps.some((s) => s.status === "error");
    const isComplete = steps.length > 0 && steps.every((s) => s.status === "done");

    return (
        <div className={cn("space-y-4", className)}>
            {/* Header with elapsed time */}
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                    {hasError ? "❌ Failed" : isComplete ? "✅ Complete" : isLoading ? "🔄 Processing..." : "Ready"}
                </span>
                {elapsedTime !== undefined && elapsedTime > 0 && (
                    <span className="text-sm text-muted-foreground">
                        {formatTime(elapsedTime)}
                    </span>
                )}
            </div>



            {/* Step indicators */}
            <div className="space-y-2">
                {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                        <div className="flex h-5 w-5 items-center justify-center text-sm">
                            {step.status === "running" && (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            )}
                            {step.status === "done" && <span className="text-green-500">✓</span>}
                            {step.status === "error" && <span className="text-red-500">✗</span>}
                            {step.status === "pending" && <span className="text-muted-foreground">○</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={cn(
                                "text-sm truncate",
                                step.status === "running" && "font-medium",
                                step.status === "done" && "text-muted-foreground",
                            )}>
                                {step.name}
                            </p>
                            {step.message && (
                                <p className="text-xs text-muted-foreground truncate">{step.message}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Compact progress indicator for dashboard job list
 * Shows just the progress bar and status
 */
interface JobProgressBadgeProps {
    status: "pending" | "processing" | "completed" | "failed";
    className?: string;
}

export function JobProgressBadge({ status, className }: JobProgressBadgeProps) {
    const config = {
        pending: { label: "Pending", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
        processing: { label: "Processing", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" },
        completed: { label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
        failed: { label: "Failed", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
    };

    const { label, color } = config[status] || config.pending;

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", color)}>
                {label}
            </span>
            {status === "processing" && (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
        </div>
    );
}
