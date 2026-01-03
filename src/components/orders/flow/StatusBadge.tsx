"use client";

/**
 * Status Badge Component
 * Displays line item status with appropriate styling
 */

import { cn } from "@/lib/utils";
import type { LineItemStatus } from "@/types";

const statusConfig: Record<LineItemStatus, { label: string; className: string }> = {
    pending: {
        label: "Pending",
        className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    },
    validated: {
        // Map validated to pending display (keeping for backwards compat)
        label: "Pending",
        className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    },
    error: {
        // Map error to pending display (errors shown at cell level now)
        label: "Pending",
        className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    },
    approved: {
        label: "Approved",
        className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
};

interface StatusBadgeProps {
    status: LineItemStatus;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const config = statusConfig[status] || statusConfig.pending;

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                config.className,
                className
            )}
        >
            {config.label}
        </span>
    );
}

interface ValidationErrorsProps {
    errors: Array<{ field: string; message: string; severity: string }>;
}

export function ValidationErrors({ errors }: ValidationErrorsProps) {
    if (!errors || errors.length === 0) return null;

    return (
        <div className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
            {errors.map((error, idx) => (
                <div key={idx} className="flex items-center gap-1">
                    <span className="text-red-500">⚠</span>
                    <span>{error.message}</span>
                </div>
            ))}
        </div>
    );
}
