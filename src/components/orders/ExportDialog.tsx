"use client";

/**
 * Export Dialog Component
 * Human-in-the-loop review before exporting data.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
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
import { createClient } from "@/lib/supabase/client";
import { mapRecords, type OutputProfile, type DataRecord, type FieldMapping } from "@/lib/export";

interface DBOutputProfile {
    id: string;
    name: string;
    description: string | null;
    field_mappings: FieldMapping[];
    format: "csv" | "json";
    format_options: {
        delimiter?: string;
        include_header?: boolean;
    };
    is_default: boolean;
}

interface ExportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orderId: string;
    records: DataRecord[];
}

export function ExportDialog({ open, onOpenChange, orderId, records }: ExportDialogProps) {
    const [profiles, setProfiles] = useState<DBOutputProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [previewData, setPreviewData] = useState<DataRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Fetch output profiles
    const fetchProfiles = useCallback(async () => {
        setIsLoading(true);
        const supabase = createClient();
        const { data, error } = await supabase
            .from("output_profiles")
            .select("*")
            .order("is_default", { ascending: false });

        if (!error && data) {
            setProfiles(data);
            // Select default or first profile
            const defaultProfile = data.find(p => p.is_default) || data[0];
            if (defaultProfile) {
                setSelectedProfileId(defaultProfile.id);
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (open) {
            fetchProfiles();
            setError(null);
        }
    }, [open, fetchProfiles]);

    // Update preview when profile changes
    useEffect(() => {
        if (selectedProfileId && records.length > 0) {
            const profile = profiles.find(p => p.id === selectedProfileId);
            if (profile) {
                const outputProfile: OutputProfile = {
                    id: profile.id,
                    tenant_id: "",
                    name: profile.name,
                    field_mappings: profile.field_mappings || [],
                    format: profile.format,
                    format_options: {
                        delimiter: profile.format_options?.delimiter || ";",
                        include_header: profile.format_options?.include_header !== false,
                    },
                    is_default: profile.is_default,
                };
                const mapped = mapRecords(records.slice(0, 5), outputProfile);
                setPreviewData(mapped);
            }
        }
    }, [selectedProfileId, profiles, records]);

    const handleExport = async () => {
        if (!selectedProfileId) return;

        setIsExporting(true);
        setError(null);

        try {
            const response = await fetch("/api/export", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    order_id: orderId,
                    profile_id: selectedProfileId,
                }),
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Export failed");
            }

            // Download the file
            const profile = profiles.find(p => p.id === selectedProfileId);
            const content = result.data.content;
            const filename = result.data.filename || `export_${profile?.name || "data"}.csv`;
            const contentType = result.data.content_type || "text/csv";

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

    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    const previewColumns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>Export Order</DialogTitle>
                    <DialogDescription>
                        Select an output profile and review the data before exporting
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 py-4">
                    {/* Profile Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Output Profile</label>
                        {isLoading ? (
                            <div className="h-9 bg-muted animate-pulse rounded-md" />
                        ) : (
                            <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(e.target.value)}
                                className="w-full h-9 rounded-md border px-3 text-sm"
                            >
                                {profiles.map(profile => (
                                    <option key={profile.id} value={profile.id}>
                                        {profile.name} ({profile.format.toUpperCase()})
                                        {profile.is_default ? " - Default" : ""}
                                    </option>
                                ))}
                            </select>
                        )}
                        {selectedProfile?.description && (
                            <p className="text-xs text-muted-foreground">
                                {selectedProfile.description}
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
                            disabled={isExporting || !selectedProfileId || records.length === 0}
                        >
                            {isExporting ? "Exporting..." : `Download ${selectedProfile?.format?.toUpperCase() || "CSV"}`}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
