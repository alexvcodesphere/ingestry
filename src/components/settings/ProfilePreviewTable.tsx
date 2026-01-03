"use client";

/**
 * ProfilePreviewTable - Live Export Preview
 * Shows color-coded columns using V/S badges matching TransformTab styling:
 * - S badge (blue): Source fields from PDF extraction
 * - V badge (purple): Virtual/AI-enriched fields  
 * - ⚠ indicator (amber): Fields not mapped to export
 */

import type { FieldDefinition, ExportConfig } from "@/types";
import { SourceLegend } from "@/components/ui/SourceTooltip";

interface ProfilePreviewTableProps {
    fields: FieldDefinition[];
    exportConfig?: ExportConfig;
}

export function ProfilePreviewTable({ fields, exportConfig }: ProfilePreviewTableProps) {
    const mappings = exportConfig?.field_mappings || [];
    const mappedSourceKeys = new Set(mappings.map(m => m.source));

    // Get columns from export mappings, or fall back to all fields
    const columns = mappings.length > 0 
        ? mappings.map(m => {
            const sourceField = fields.find(f => f.key === m.source);
            return {
                key: m.target || m.source,
                source: m.source,
                sourceField,
                isMapped: true,
            };
        })
        : fields.map(f => ({
            key: f.key,
            source: f.key,
            sourceField: f,
            isMapped: false,
        }));

    // Generate sample data based on field types
    const getSampleValue = (field?: FieldDefinition): string => {
        if (!field) return "—";
        
        if (field.source === 'computed') {
            if (field.logic_type === 'ai_enrichment') {
                return "✨ Spark will generate...";
            }
            if (field.logic_type === 'template' && field.template) {
                return `[${field.template}]`;
            }
            return field.fallback || "—";
        }

        // Sample values for source fields
        switch (field.type) {
            case 'number':
                return "42";
            case 'currency':
                return "€149.99";
            default:
                return field.label || field.key || "Sample";
        }
    };

    if (fields.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                <div className="text-center">
                    <p className="font-medium">No fields defined yet</p>
                    <p className="text-xs mt-1">Add fields in PDF Extraction to see preview</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="text-xs text-muted-foreground mb-3 flex items-center gap-4">
                <span className="font-medium">Export Preview</span>
                <SourceLegend compact />
            </div>

            <div className="flex-1 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                        <tr>
                            {columns.map((col, idx) => {
                                const isVirtual = col.sourceField?.source === 'computed';
                                const isAI = col.sourceField?.logic_type === 'ai_enrichment';
                                
                                // Background color matching TransformTab/DraftOrderGrid style
                                const bgClass = isVirtual
                                    ? 'bg-purple-50 dark:bg-purple-950/50'
                                    : 'bg-blue-50 dark:bg-blue-950/50';
                                
                                return (
                                    <th
                                        key={idx}
                                        className={`px-3 py-2 text-left font-medium text-xs whitespace-nowrap ${bgClass}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {/* Badge matching TransformTab style */}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${
                                                isVirtual
                                                    ? 'bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400'
                                                    : 'bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400'
                                            }`}>
                                                {isVirtual ? 'V' : 'S'}
                                            </span>
                                            {isAI && <span className="text-amber-500">✨</span>}
                                            <span className="truncate">{col.key}</span>
                                            {/* Show warning for unmapped fields */}
                                            {!col.isMapped && exportConfig && (
                                                <span className="text-amber-500 text-[10px] shrink-0" title="Not mapped to export">⚠</span>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Sample row 1 */}
                        <tr className="border-b">
                            {columns.map((col, idx) => {
                                const isVirtual = col.sourceField?.source === 'computed';
                                const bgClass = isVirtual
                                    ? 'bg-purple-50/30 dark:bg-purple-950/20'
                                    : 'bg-blue-50/30 dark:bg-blue-950/20';
                                return (
                                    <td key={idx} className={`px-3 py-2 text-muted-foreground ${bgClass}`}>
                                        {getSampleValue(col.sourceField)}
                                    </td>
                                );
                            })}
                        </tr>
                        {/* Sample row 2 */}
                        <tr className="border-b">
                            {columns.map((col, idx) => {
                                const isVirtual = col.sourceField?.source === 'computed';
                                const bgClass = isVirtual
                                    ? 'bg-purple-50/20 dark:bg-purple-950/10'
                                    : 'bg-blue-50/20 dark:bg-blue-950/10';
                                return (
                                    <td key={idx} className={`px-3 py-2 text-muted-foreground/70 ${bgClass}`}>
                                        {col.sourceField?.source === 'computed' && col.sourceField?.logic_type === 'ai_enrichment'
                                            ? "✨ AI generated text..."
                                            : "..."}
                                    </td>
                                );
                            })}
                        </tr>
                        {/* Sample row 3 - faded */}
                        <tr className="opacity-40">
                            {columns.map((col, idx) => {
                                const isVirtual = col.sourceField?.source === 'computed';
                                const bgClass = isVirtual
                                    ? 'bg-purple-50/10 dark:bg-purple-950/5'
                                    : 'bg-blue-50/10 dark:bg-blue-950/5';
                                return (
                                    <td key={idx} className={`px-3 py-2 text-muted-foreground/50 ${bgClass}`}>
                                        ...
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Export target info */}
            {exportConfig && (
                <div className="mt-3 text-xs text-muted-foreground flex items-center justify-between">
                    <span>
                        Target: <span className="font-medium capitalize">{exportConfig.shop_system}</span>
                        {" · "}
                        {exportConfig.format.toUpperCase()}
                    </span>
                    <span>{mappings.length} column(s) mapped</span>
                </div>
            )}
        </div>
    );
}
