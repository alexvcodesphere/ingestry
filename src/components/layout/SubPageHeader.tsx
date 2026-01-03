"use client";

import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SubPageHeaderProps {
    /** Back button label and onClick handler */
    backLabel: string;
    onBack: () => void;
    /** Main content area - typically editable title or static title */
    children: ReactNode;
    /** Right-side actions (buttons) */
    actions?: ReactNode;
    /** Optional className for the header container */
    className?: string;
}

/**
 * SubPageHeader - Header for full-page sub-views (e.g., profile editor, order details)
 * Provides consistent back navigation, title area, and action buttons.
 */
export function SubPageHeader({
    backLabel,
    onBack,
    children,
    actions,
    className,
}: SubPageHeaderProps) {
    return (
        <header
            className={cn(
                "px-6 py-4 flex items-center justify-between border-b border-border/60 bg-background/80 backdrop-blur-sm",
                className
            )}
        >
            <div className="flex items-center gap-4">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all active:scale-[0.98]"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {backLabel}
                </button>
                <div className="h-6 w-px bg-border/50" />
                <div className="flex items-center gap-3">
                    {children}
                </div>
            </div>
            {actions && (
                <div className="flex items-center gap-2">
                    {actions}
                </div>
            )}
        </header>
    );
}
