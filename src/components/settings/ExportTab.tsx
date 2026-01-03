"use client";

/**
 * ExportTab - Export configurations with Mapping Validator
 * Part of the unified profile editor (Schema Master pattern)
 */

import { useState, useMemo, useCallback, memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ExportConfig, FieldDefinition, FieldMapping, ShopSystem } from "@/types";
import { AlertTriangle, Plus, Trash2, Ghost, ArrowRight } from "lucide-react";

const SHOP_SYSTEMS: { value: ShopSystem; label: string }[] = [
    { value: "xentral", label: "Xentral ERP" },
    { value: "shopware", label: "Shopware 6" },
    { value: "shopify", label: "Shopify" },
];

const DEFAULT_MAPPING: FieldMapping = {
    source: "",
    target: "",
    template: "",
    default_value: "",
};

/** Virtualized Field Mappings List - renders only visible items */
interface VirtualizedMappingsProps {
    mappings: FieldMapping[];
    fields: FieldDefinition[];
    validSourceKeys: Set<string>;
    onMappingChange: (idx: number, updates: Partial<FieldMapping>) => void;
    onRemoveMapping: (idx: number) => void;
    onAddMapping: () => void;
}

function VirtualizedMappings({
    mappings,
    fields,
    validSourceKeys,
    onMappingChange,
    onRemoveMapping,
    onAddMapping,
}: VirtualizedMappingsProps) {
    const parentRef = useRef<HTMLDivElement>(null);
    
    const virtualizer = useVirtualizer({
        count: mappings.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72, // row height + gap
        overscan: 5,
    });

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Field Mappings ({mappings.length})</Label>
                <Button variant="outline" size="sm" onClick={onAddMapping} className="h-8 text-xs gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    Add
                </Button>
            </div>
            <div
                ref={parentRef}
                className="max-h-56 overflow-y-auto pr-1"
            >
                <div
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const idx = virtualRow.index;
                        const mapping = mappings[idx];
                        const isInvalid = mapping.source && !validSourceKeys.has(mapping.source);
                        const sourceField = fields.find(f => f.key === mapping.source);
                        
                        return (
                            <div
                                key={idx}
                                className="pb-3"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <div
                                    className={`flex items-center gap-3 p-2.5 border border-border/60 rounded-lg ring-1 ring-inset text-sm ${
                                        isInvalid 
                                            ? "ring-amber-300/50 dark:ring-amber-700/50 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30" 
                                            : "ring-border/50"
                                    }`}
                                >
                                    {sourceField && (
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                            sourceField.source === 'computed'
                                                ? 'bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400'
                                                : 'bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400'
                                        }`}>
                                            {sourceField.source === 'computed' ? 'V' : 'S'}
                                        </span>
                                    )}
                                    <Select
                                        value={mapping.source || "_custom"}
                                        onValueChange={(value) =>
                                            onMappingChange(idx, { source: value === "_custom" ? "" : value })
                                        }
                                    >
                                        <SelectTrigger className="w-32 h-8 text-xs">
                                            <SelectValue placeholder="Source" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="_custom">Custom...</SelectItem>
                                            {fields.map((f) => (
                                                <SelectItem key={f.key} value={f.key}>
                                                    {f.source === 'computed' ? '○ ' : '● '}{f.label || f.key}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                                    <Input
                                        value={mapping.target}
                                        onChange={(e) => onMappingChange(idx, { target: e.target.value })}
                                        placeholder="target_column"
                                        className="flex-1 h-8 text-xs min-w-0"
                                    />
                                    <Input
                                        value={mapping.default_value || ""}
                                        onChange={(e) => onMappingChange(idx, { default_value: e.target.value })}
                                        placeholder="Default"
                                        className="w-20 h-8 text-xs shrink-0"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onRemoveMapping(idx)}
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

interface ExportTabProps {
    exportConfigs: ExportConfig[];
    fields: FieldDefinition[];
    defaultExportConfigIdx: number;
    onExportConfigsChange: (configs: ExportConfig[]) => void;
    onDefaultIdxChange: (idx: number) => void;
}

export function ExportTab({
    exportConfigs,
    fields,
    defaultExportConfigIdx,
    onExportConfigsChange,
    onDefaultIdxChange,
}: ExportTabProps) {
    const [activeConfigIdx, setActiveConfigIdx] = useState(0);
    const activeConfig = exportConfigs[activeConfigIdx];

    // Memoize derived values
    const allFieldKeys = useMemo(() => 
        fields.map((f) => f.key).filter(Boolean),
        [fields]
    );
    const validSourceKeys = useMemo(() => new Set(allFieldKeys), [allFieldKeys]);

    const mappedSources = useMemo(() => 
        new Set(activeConfig?.field_mappings.map((m) => m.source).filter(Boolean) || []),
        [activeConfig?.field_mappings]
    );
    const unmappedFields = useMemo(() => 
        fields.filter((f) => f.key && !mappedSources.has(f.key)),
        [fields, mappedSources]
    );

    const getInvalidMappings = useCallback((config: ExportConfig) => {
        return config.field_mappings
            .map((m, idx) => ({ ...m, idx }))
            .filter((m) => m.source && !validSourceKeys.has(m.source));
    }, [validSourceKeys]);

    const handleAddConfig = () => {
        const newConfig: ExportConfig = {
            id: crypto.randomUUID(),
            name: `Export ${exportConfigs.length + 1}`,
            shop_system: "xentral",
            field_mappings: fields.map((f) => ({
                source: f.key,
                target: f.key,
            })),
            format: "csv",
            format_options: { delimiter: ";", include_header: true },
            is_default: exportConfigs.length === 0,
        };
        onExportConfigsChange([...exportConfigs, newConfig]);
        setActiveConfigIdx(exportConfigs.length);
    };

    const handleRemoveConfig = (idx: number) => {
        const updated = exportConfigs.filter((_, i) => i !== idx);
        onExportConfigsChange(updated);
        if (activeConfigIdx >= updated.length) {
            setActiveConfigIdx(Math.max(0, updated.length - 1));
        }
        if (defaultExportConfigIdx === idx) {
            onDefaultIdxChange(0);
        } else if (defaultExportConfigIdx > idx) {
            onDefaultIdxChange(defaultExportConfigIdx - 1);
        }
    };

    const updateConfig = (updates: Partial<ExportConfig>) => {
        onExportConfigsChange(
            exportConfigs.map((c, i) =>
                i === activeConfigIdx ? { ...c, ...updates } : c
            )
        );
    };

    const handleAddMapping = (source?: string) => {
        if (!activeConfig) return;
        updateConfig({
            field_mappings: [
                ...activeConfig.field_mappings,
                { ...DEFAULT_MAPPING, source: source || "", target: source || "" },
            ],
        });
    };

    const handleRemoveMapping = (idx: number) => {
        if (!activeConfig) return;
        updateConfig({
            field_mappings: activeConfig.field_mappings.filter((_, i) => i !== idx),
        });
    };

    const handleMappingChange = (idx: number, updates: Partial<FieldMapping>) => {
        if (!activeConfig) return;
        updateConfig({
            field_mappings: activeConfig.field_mappings.map((m, i) =>
                i === idx ? { ...m, ...updates } : m
            ),
        });
    };

    const invalidMappings = activeConfig ? getInvalidMappings(activeConfig) : [];

    // Badge with tooltip helper
    const SourceBadge = ({ field }: { field: FieldDefinition }) => {
        const isComputed = field.source === 'computed';
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold cursor-help ${
                            isComputed
                                ? 'bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400'
                                : 'bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400'
                        }`}>
                            {isComputed ? 'V' : 'S'}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                        {isComputed ? 'Virtual (computed field)' : 'Source (from input)'}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    return (
        <div className="space-y-4">
            {/* Export Config Tabs */}
            <div className="flex items-center gap-2 pb-3 border-b">
                {exportConfigs.map((config, idx) => (
                    <button
                        key={config.id}
                        onClick={() => setActiveConfigIdx(idx)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            idx === activeConfigIdx
                                ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 ring-2 ring-inset ring-slate-400/50"
                                : "bg-muted hover:bg-muted/80 text-muted-foreground"
                        }`}
                    >
                        {config.name}
                        {idx === defaultExportConfigIdx && " ⭐"}
                    </button>
                ))}
                <Button variant="ghost" size="sm" onClick={() => handleAddConfig()} className="h-9 w-9 p-0">
                    <Plus className="h-4 w-4" />
                </Button>
            </div>

            {activeConfig ? (
                <div className="space-y-4">
                    {/* Config Settings */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Name</Label>
                            <Input
                                value={activeConfig.name}
                                onChange={(e) => updateConfig({ name: e.target.value })}
                                className="h-9"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Target System</Label>
                            <Select
                                value={activeConfig.shop_system}
                                onValueChange={(value) =>
                                    updateConfig({ shop_system: value as ShopSystem })
                                }
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SHOP_SYSTEMS.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>
                                            {s.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Format</Label>
                            <Select
                                value={activeConfig.format}
                                onValueChange={(value) =>
                                    updateConfig({ format: value as "csv" | "json" })
                                }
                            >
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="csv">CSV</SelectItem>
                                    <SelectItem value="json">JSON</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeConfigIdx !== defaultExportConfigIdx && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onDefaultIdxChange(activeConfigIdx)}
                                className="h-8 text-xs"
                            >
                                Set as Default
                            </Button>
                        )}
                        {exportConfigs.length > 1 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-destructive"
                                onClick={() => handleRemoveConfig(activeConfigIdx)}
                            >
                                Remove
                            </Button>
                        )}
                    </div>

                    {/* Mapping Validator Warning */}
                    {invalidMappings.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-800 dark:text-amber-200">
                                    {invalidMappings.length} mapping(s) reference missing fields
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    {invalidMappings.map((m) => `"${m.source}"`).join(", ")}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Unmapped Fields */}
                    {unmappedFields.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Ghost className="h-3.5 w-3.5" />
                                <span>{unmappedFields.length} unmapped field(s)</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {unmappedFields.map((field) => (
                                    <TooltipProvider key={field.key}>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <button
                                                    onClick={() => handleAddMapping(field.key)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 border border-dashed rounded-lg text-xs transition-all hover:border-solid hover:bg-muted/50 ${
                                                        field.source === 'computed'
                                                            ? 'border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400'
                                                            : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                                                    }`}
                                                >
                                                    <span className={`text-[9px] px-1 py-0.5 rounded font-semibold ${
                                                        field.source === 'computed'
                                                            ? 'bg-purple-100 dark:bg-purple-900/80'
                                                            : 'bg-blue-100 dark:bg-blue-900/80'
                                                    }`}>
                                                        {field.source === 'computed' ? 'V' : 'S'}
                                                    </span>
                                                    {field.label || field.key}
                                                    <Plus className="h-3 w-3 opacity-50" />
                                                </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="text-xs">
                                                Click to add mapping for {field.source === 'computed' ? 'virtual' : 'source'} field
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Field Mappings - Virtualized */}
                    <VirtualizedMappings
                        mappings={activeConfig.field_mappings}
                        fields={fields}
                        validSourceKeys={validSourceKeys}
                        onMappingChange={handleMappingChange}
                        onRemoveMapping={handleRemoveMapping}
                        onAddMapping={handleAddMapping}
                    />
                </div>
            ) : (
                <div className="text-center py-12 text-muted-foreground border border-dashed border-border/60 rounded-lg">
                    <p className="font-medium">No export configurations</p>
                    <Button variant="outline" className="mt-3" onClick={() => handleAddConfig()}>
                        Create Export Config
                    </Button>
                </div>
            )}
        </div>
    );
}
