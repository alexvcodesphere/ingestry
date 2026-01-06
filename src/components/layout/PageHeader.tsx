/**
 * PageHeader - Unified Page Header Component
 * Provides consistent Header-Content-Actions hierarchy across all pages.
 * 
 * Features:
 * - Left: Title + optional breadcrumb lineage
 * - Right: Primary action slot
 */

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Breadcrumb {
    label: string;
    href?: string;
}

interface PageHeaderProps {
    title: string;
    description?: string;
    breadcrumbs?: Breadcrumb[];
    actions?: React.ReactNode;
    className?: string;
}

export function PageHeader({
    title,
    description,
    breadcrumbs,
    actions,
    className,
}: PageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-4 mb-6 sm:flex-row sm:items-start sm:justify-between", className)}>
            <div className="min-w-0 flex-1">
                {/* Breadcrumbs */}
                {breadcrumbs && breadcrumbs.length > 0 && (
                    <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                        {breadcrumbs.map((crumb, index) => (
                            <span key={index} className="flex items-center gap-1">
                                {index > 0 && <ChevronRight className="h-3.5 w-3.5" />}
                                {crumb.href ? (
                                    <Link 
                                        href={crumb.href} 
                                        className="hover:text-foreground transition-colors"
                                    >
                                        {crumb.label}
                                    </Link>
                                ) : (
                                    <span>{crumb.label}</span>
                                )}
                            </span>
                        ))}
                    </nav>
                )}
                
                {/* Title */}
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                
                {/* Description */}
                {description && (
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                )}
            </div>
            
            {/* Actions */}
            {actions && (
                <div className="flex items-center gap-2 shrink-0">
                    {actions}
                </div>
            )}
        </div>
    );
}
