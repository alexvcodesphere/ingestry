"use client";

/**
 * ProfilePreviewTable - Live Export Preview
 * Shows color-coded columns based on field source:
 * - Blue (primary): Source fields from input
 * - Purple (accent): Virtual/AI-enriched fields  
 * - Green border: Mapped to export target
 */

import type { FieldDefinition, ExportConfig } from "@/types";

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
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-primary/20 border border-primary/40" />
                    Source
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-purple-500/20 border border-purple-500/40" />
                    Virtual
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded border-b-2 border-b-emerald-500 bg-muted" />
                    Mapped
                </span>
            </div>

            <div className="flex-1 overflow-auto border rounded-lg">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                        <tr>
                            {columns.map((col, idx) => {
                                const isVirtual = col.sourceField?.source === 'computed';
                                const isAI = col.sourceField?.logic_type === 'ai_enrichment';
                                
                                return (
                                    <th
                                        key={idx}
                                        className={`px-3 py-2 text-left font-medium text-xs uppercase tracking-wide whitespace-nowrap ${
                                            isVirtual
                                                ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                                                : 'bg-primary/5 text-primary'
                                        } ${col.isMapped ? 'border-b-2 border-b-emerald-500' : 'border-b'}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {isAI && <span className="text-amber-500">✨</span>}
                                            {col.key}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Sample row 1 */}
                        <tr className="border-b">
                            {columns.map((col, idx) => (
                                <td key={idx} className="px-3 py-2 text-muted-foreground">
                                    {getSampleValue(col.sourceField)}
                                </td>
                            ))}
                        </tr>
                        {/* Sample row 2 */}
                        <tr className="border-b bg-muted/30">
                            {columns.map((col, idx) => (
                                <td key={idx} className="px-3 py-2 text-muted-foreground/70">
                                    {col.sourceField?.source === 'computed' && col.sourceField?.logic_type === 'ai_enrichment'
                                        ? "✨ AI generated text..."
                                        : "..."}
                                </td>
                            ))}
                        </tr>
                        {/* Sample row 3 - faded */}
                        <tr className="opacity-40">
                            {columns.map((col, idx) => (
                                <td key={idx} className="px-3 py-2 text-muted-foreground/50">
                                    ...
                                </td>
                            ))}
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
