"use client";

/**
 * IntakeTab - Source field definitions
 * Part of the unified profile editor (Schema Master pattern)
 * Supports multiple input sources (PDF, CSV, etc.)
 */

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
import { Trash2, FileInput, Plus } from "lucide-react";

const FIELD_TYPES = ["text", "number", "currency", "enum"];

interface IntakeTabProps {
    fields: FieldDefinition[];
    onFieldsChange: (fields: FieldDefinition[]) => void;
}

export function IntakeTab({ fields, onFieldsChange }: IntakeTabProps) {
    const extractedFields = fields.filter(f => f.source !== 'computed');
    
    const handleAddField = () => {
        onFieldsChange([
            ...fields,
            { key: "", label: "", type: "text", required: false, source: "extracted" },
        ]);
    };

    const handleRemoveField = (key: string) => {
        onFieldsChange(fields.filter((f) => f.key !== key));
    };

    const handleFieldChange = (key: string, updates: Partial<FieldDefinition>) => {
        onFieldsChange(
            fields.map((f) => (f.key === key ? { ...f, ...updates } : f))
        );
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-base font-medium">Source Fields</Label>
                    <p className="text-sm text-muted-foreground">
                        Fields extracted from input documents (PDF, CSV, etc.)
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleAddField} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Field
                </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {extractedFields.map((field, index) => (
                    <div
                        key={field.key || index}
                        className="flex items-center gap-2 p-3 border rounded-xl bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/30 dark:to-transparent ring-1 ring-inset ring-blue-200/50 dark:ring-blue-800/50"
                    >
                        {/* Source Badge */}
                        <span className="text-[10px] px-2 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide whitespace-nowrap">
                            SRC
                        </span>
                        
                        <Input
                            placeholder="key"
                            value={field.key}
                            onChange={(e) =>
                                handleFieldChange(field.key, { key: e.target.value })
                            }
                            className="w-24 h-8 text-sm"
                        />
                        <Input
                            placeholder="Label"
                            value={field.label}
                            onChange={(e) =>
                                handleFieldChange(field.key, { label: e.target.value })
                            }
                            className="flex-1 h-8 text-sm"
                        />
                        <Select
                            value={field.type}
                            onValueChange={(value) =>
                                handleFieldChange(field.key, {
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
                                    handleFieldChange(field.key, { required: e.target.checked })
                                }
                                className="rounded"
                            />
                            Req
                        </label>
                        <Input
                            placeholder="AI hint..."
                            value={field.instructions || ""}
                            onChange={(e) =>
                                handleFieldChange(field.key, { instructions: e.target.value })
                            }
                            className="w-32 h-8 text-sm"
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveField(field.key)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                ))}
                {extractedFields.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                        <FileInput className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No source fields defined</p>
                        <p className="text-sm mt-1">Add fields to extract from input documents</p>
                    </div>
                )}
            </div>
        </div>
    );
}
