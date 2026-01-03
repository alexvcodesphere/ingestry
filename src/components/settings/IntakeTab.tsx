"use client";

/**
 * IntakeTab - Source field definitions
 * Part of the unified profile editor (Schema Master pattern)
 * Supports multiple input sources (PDF, CSV, etc.)
 * Features CSV import to prefill fields and S/V toggle for source type
 */

import { useRef, useState, useMemo, useCallback } from "react";
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
import type { FieldDefinition } from "@/types";
import { Trash2, FileInput, Plus, Upload, Search } from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPES = ["text", "number", "currency", "enum"];

interface IntakeTabProps {
    fields: FieldDefinition[];
    onFieldsChange: (fields: FieldDefinition[]) => void;
}

/** Parse CSV header row and detect delimiter */
function parseCSVHeaders(content: string): string[] {
    const firstLine = content.split(/\r?\n/)[0] || "";
    // Detect delimiter: semicolon or comma
    const delimiter = firstLine.includes(";") ? ";" : ",";
    return firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
}

/** Convert header to field key (lowercase, underscored) */
function headerToKey(header: string): string {
    return header
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
}

/** Convert header to label (title case) */
function headerToLabel(header: string): string {
    return header
        .replace(/_/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
}

export function IntakeTab({ fields, onFieldsChange }: IntakeTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    
    // Memoize filtered fields to prevent recalculation on every render
    const extractedFields = useMemo(() => 
        fields.filter(f => f.source !== 'computed'),
        [fields]
    );
    
    const filteredFields = useMemo(() => 
        extractedFields.filter(f => 
            !search || 
            f.key.toLowerCase().includes(search.toLowerCase()) ||
            f.label.toLowerCase().includes(search.toLowerCase())
        ),
        [extractedFields, search]
    );
    
    const handleAddField = () => {
        onFieldsChange([
            ...fields,
            { key: "", label: "", type: "text", required: false, source: "extracted" },
        ]);
    };

    const handleRemoveField = (index: number) => {
        // Find the actual field in the full array using extracted fields index
        const fieldToRemove = extractedFields[index];
        onFieldsChange(fields.filter((f) => f !== fieldToRemove));
    };

    const handleFieldChange = (index: number, updates: Partial<FieldDefinition>) => {
        // Find the actual field in the full array using extracted fields index
        const fieldToUpdate = extractedFields[index];
        onFieldsChange(
            fields.map((f) => (f === fieldToUpdate ? { ...f, ...updates } : f))
        );
    };

    /** Toggle field source between extracted and computed */
    const handleToggleSource = (index: number) => {
        const fieldToToggle = extractedFields[index];
        onFieldsChange(
            fields.map((f) => {
                if (f !== fieldToToggle) return f;
                const newSource = f.source === 'computed' ? 'extracted' : 'computed';
                return {
                    ...f,
                    source: newSource,
                    // Set no logic by default when switching to computed
                    logic_type: newSource === 'computed' ? 'none' : undefined,
                };
            })
        );
    };

    /** Handle CSV file import */
    const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (!content) return;

            const headers = parseCSVHeaders(content);
            const existingKeys = new Set(fields.map(f => f.key));
            
            // Create new fields from headers, skip duplicates
            const newFields: FieldDefinition[] = headers
                .filter(h => h.trim())
                .map(header => {
                    const key = headerToKey(header);
                    return {
                        key,
                        label: headerToLabel(header),
                        type: "text" as const,
                        required: false,
                        source: "extracted" as const,
                    };
                })
                .filter(f => f.key && !existingKeys.has(f.key));

            if (newFields.length > 0) {
                onFieldsChange([...fields, ...newFields]);
                toast.success(`Imported ${newFields.length} fields from CSV`);
            } else {
                toast.info("No new fields to import (headers already exist or empty)");
            }
        };
        reader.readAsText(file);
        
        // Reset input so same file can be imported again
        event.target.value = "";
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-base font-medium">Source Fields</Label>
                    <p className="text-sm text-muted-foreground">
                        Fields extracted from input documents. Click badge to toggle S↔V.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* CSV Import */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleCSVImport}
                        className="hidden"
                    />
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-1.5"
                        title="Import fields from CSV headers"
                    >
                        <Upload className="h-4 w-4" />
                        Import CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleAddField} className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        Add Field
                    </Button>
                </div>
            </div>

            {/* Search */}
            {extractedFields.length > 5 && (
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search fields..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                    />
                </div>
            )}

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {filteredFields.map((field) => {
                    const realIndex = extractedFields.indexOf(field);
                    return (
                        <div
                            key={realIndex}
                            className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30 ring-1 ring-inset ring-border/50"
                        >
                            {/* Clickable Source Badge - Toggle S/V */}
                            <button
                                type="button"
                                onClick={() => handleToggleSource(realIndex)}
                                className={`text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer transition-colors ${
                                    field.source === 'computed'
                                        ? 'bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-800'
                                        : 'bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800'
                                }`}
                                title={field.source === 'computed' ? 'Virtual field (click to make Source)' : 'Source field (click to make Virtual)'}
                            >
                                {field.source === 'computed' ? 'V' : 'S'}
                            </button>
                            
                            <Input
                                placeholder="key"
                                value={field.key}
                                onChange={(e) =>
                                    handleFieldChange(realIndex, { key: e.target.value })
                                }
                                className="w-24 h-8 text-sm"
                            />
                            <Input
                                placeholder="Label"
                                value={field.label}
                                onChange={(e) =>
                                    handleFieldChange(realIndex, { label: e.target.value })
                                }
                                className="flex-1 h-8 text-sm"
                            />
                            <Select
                                value={field.type}
                                onValueChange={(value) =>
                                    handleFieldChange(realIndex, {
                                        type: value as FieldDefinition["type"],
                                    })
                                }
                            >
                                <SelectTrigger className="w-24 h-8 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FIELD_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>
                                            {t}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap px-2">
                                <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                        handleFieldChange(realIndex, { required: e.target.checked })
                                    }
                                    className="rounded"
                                />
                                Req
                            </label>
                            <Input
                                placeholder="AI hint..."
                                value={field.instructions || ""}
                                onChange={(e) =>
                                    handleFieldChange(realIndex, { instructions: e.target.value })
                                }
                                className="w-32 h-8 text-sm"
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveField(realIndex)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    );
                })}
                {extractedFields.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border border-dashed border-border/60 rounded-lg">
                        <FileInput className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No source fields defined</p>
                        <p className="text-sm mt-1">Import from CSV or add fields manually</p>
                    </div>
                )}
            </div>
        </div>
    );
}

