/**
 * LineageBadge - Atomic Data Provenance Badge
 * 
 * The ONLY way to show data provenance in the Ingestry application.
 * Use everywhere data origin matters: table headers, search results, page titles.
 * 
 * - Source (S): Data extracted from source document (Blue)
 * - Virtual (V): Computed, templated, or AI-enriched data (Purple)
 */

import { cn } from "@/lib/utils";

type LineageType = "source" | "virtual";

interface LineageBadgeProps {
    type: LineageType;
    className?: string;
    /** Show full label instead of abbreviation */
    expanded?: boolean;
}

export function LineageBadge({ type, className, expanded = false }: LineageBadgeProps) {
    const isSource = type === "source";
    
    return (
        <span
            className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0",
                isSource
                    ? "bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400"
                    : "bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400",
                className
            )}
        >
            {expanded ? (isSource ? "Source" : "Virtual") : (isSource ? "S" : "V")}
        </span>
    );
}
