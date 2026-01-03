"use client";

/**
 * Export Dialog Component
 * Uses snapshotted export config from order metadata (Config Snapshotting guardrail).
 * Falls back to profile's export_configs for legacy orders.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { mapRecords, type OutputProfile, type DataRecord, type FieldMapping } from "@/lib/export";
import type { ExportConfig, ShopSystem } from "@/types";

interface ExportConfigOption {
    id: string;
    name: string;
    shop_system: ShopSystem;
    field_mappings: FieldMapping[];
    format: "csv" | "json";
    format_options: {
        delimiter?: string;
        include_header?: boolean;
    };
    is_default?: boolean;
    source: "snapshot" | "profile";
}

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    records: DataRecord[];
}

export function ExportDialog({ open, onOpenChange, orderId, records }: ExportDialogProps) {
    const [exportConfigs, setExportConfigs] = useState<ExportConfigOption[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [previewData, setPreviewData] = useState<DataRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Fetch export config from order metadata (snapshot) or profile fallback
    const fetchExportConfig = useCallback(async () => {
        setIsLoading(true);
        const supabase = createClient();

        try {
            // Fetch the order with metadata and profile
            const { data: order, error: orderError } = await supabase
                .from("draft_orders")
                .select("metadata")
                .eq("id", orderId)
                .single();

            if (orderError) throw orderError;

            const configs: ExportConfigOption[] = [];

            // Check for snapshotted config in metadata (preferred)
            const snapshot = order?.metadata?.export_config_snapshot as ExportConfig | null;
            if (snapshot) {
                configs.push({
                    ...snapshot,
                    id: snapshot.id || "snapshot",
                    source: "snapshot",
                });
            }

            // Fallback: fetch from profile if no snapshot or additional configs needed
            if (order?.metadata?.profile_id) {
                const { data: profile } = await supabase
                    .from("input_profiles")
                    .select("export_configs, default_export_config_idx")
                    .eq("id", order.metadata.profile_id)
                    .single();

                if (profile?.export_configs && Array.isArray(profile.export_configs)) {
                    for (const config of profile.export_configs) {
                        // Don't add duplicates if already in snapshot
                        if (!snapshot || config.id !== snapshot.id) {
                            configs.push({
                                ...config,
                                source: "profile",
                            });
                        }
                    }
                }
            }

            setExportConfigs(configs);
            
            // Select first config (snapshot takes priority)
            if (configs.length > 0) {
                setSelectedConfigId(configs[0].id);
            }
        } catch (err) {
            console.error("Failed to fetch export config:", err);
            setError("Failed to load export configuration");
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        if (open) {
            fetchExportConfig();
            setError(null);
        }
    }, [open, fetchExportConfig]);

    // Update preview when config changes
    useEffect(() => {
        if (selectedConfigId && records.length > 0) {
            const config = exportConfigs.find(c => c.id === selectedConfigId);
            if (config) {
                const outputProfile: OutputProfile = {
                    id: config.id,
                    name: config.name,
                    shop_system: config.shop_system,
                    field_mappings: config.field_mappings || [],
                    format: config.format,
                    format_options: {
                        delimiter: config.format_options?.delimiter || ";",
                        include_header: config.format_options?.include_header !== false,
                    },
                    is_default: config.is_default,
                };
                const mapped = mapRecords(records.slice(0, 5), outputProfile);
                setPreviewData(mapped);
            }
        }
    }, [selectedConfigId, exportConfigs, records]);

    const handleExport = async () => {
        if (!selectedConfigId) return;

        setIsExporting(true);
        setError(null);

        try {
            const config = exportConfigs.find(c => c.id === selectedConfigId);
            if (!config) throw new Error("No export config selected");

            // Build output profile from selected config
            const outputProfile: OutputProfile = {
                id: config.id,
                name: config.name,
                shop_system: config.shop_system,
                field_mappings: config.field_mappings || [],
                format: config.format,
                format_options: {
                    delimiter: config.format_options?.delimiter || ";",
                    include_header: config.format_options?.include_header !== false,
                },
                is_default: config.is_default,
            };

            // Map all records
            const mappedData = mapRecords(records, outputProfile);

            // Serialize based on format
            let content: string;
            let contentType: string;
            let extension: string;

            if (config.format === "csv") {
                const headers = Object.keys(mappedData[0] || {});
                const delimiter = config.format_options?.delimiter || ";";
                const rows = [
                    config.format_options?.include_header !== false ? headers.join(delimiter) : "",
                    ...mappedData.map(row =>
                        headers.map(h => String(row[h] || "").replace(/"/g, '""')).join(delimiter)
                    ),
                ].filter(Boolean);
                content = rows.join("\n");
                contentType = "text/csv";
                extension = "csv";
            } else {
                content = JSON.stringify(mappedData, null, 2);
                contentType = "application/json";
                extension = "json";
            }

            // Download
            const timestamp = new Date().toISOString().slice(0, 10);
            const filename = `export_${config.name.toLowerCase().replace(/\s+/g, "_")}_${timestamp}.${extension}`;
            const blob = new Blob([content], { type: contentType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setIsExporting(false);
        }
    };

    const selectedConfig = exportConfigs.find(c => c.id === selectedConfigId);
    const previewColumns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Export Order</DialogTitle>
                    <DialogDescription>
                        Review the data transformation before exporting
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    {/* Config Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Export Configuration</label>
                        {isLoading ? (
                            <div className="h-9 bg-muted animate-pulse rounded-md" />
                        ) : exportConfigs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No export configuration available. Configure exports in your processing profile.
                            </p>
                        ) : (
                            <Select
                                value={selectedConfigId}
                                onValueChange={setSelectedConfigId}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {exportConfigs.map(config => (
                                        <SelectItem key={config.id} value={config.id}>
                                            {config.name} ({config.format.toUpperCase()})
                                            {config.source === "snapshot" && " ✓ Snapshot"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {selectedConfig && (
                            <p className="text-xs text-muted-foreground">
                                Target: {selectedConfig.shop_system} • 
                                {selectedConfig.source === "snapshot" 
                                    ? " Using config from order creation time"
                                    : " From current profile"
                                }
                            </p>
                        )}
                    </div>

                    {/* Preview Table */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                                Preview (first {Math.min(5, records.length)} of {records.length} records)
                            </label>
                        </div>
                        
                        <div className="border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto max-h-64">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted sticky top-0">
                                        <tr>
                                            {previewColumns.map(col => (
                                                <th
                                                    key={col}
                                                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                                                >
                                                    {col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {previewData.map((row, i) => (
                                            <tr key={i} className="hover:bg-muted/50">
                                                {previewColumns.map(col => (
                                                    <td
                                                        key={col}
                                                        className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate"
                                                        title={String(row[col] || "")}
                                                    >
                                                        {String(row[col] || "")}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {records.length === 0 && (
                            <p className="text-center text-muted-foreground py-4">
                                No data to export
                            </p>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                        Total: {records.length} records
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleExport}
                            disabled={isExporting || !selectedConfigId || records.length === 0}
                        >
                            {isExporting ? "Exporting..." : `Download ${selectedConfig?.format?.toUpperCase() || "CSV"}`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
