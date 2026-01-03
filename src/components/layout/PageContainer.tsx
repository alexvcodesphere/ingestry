/**
 * PageContainer - Level 1 Glass Surface
 * Wraps page content in the Layered Design System surface.
 * NOTE: Never nest glass-surface elements; use bg-muted/30 for nested cards.
 */

import { cn } from "@/lib/utils";

interface PageContainerProps {
    children: React.ReactNode;
    className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
    return (
        <div className={cn("glass-surface rounded-2xl p-6", className)}>
            {children}
        </div>
    );
}
