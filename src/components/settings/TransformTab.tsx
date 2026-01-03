"use client";

/**
 * TransformTab - Logic & AI Enrichment
 * Part of the unified profile editor (Schema Master pattern)
 */

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateInput } from "@/components/settings/TemplateInput";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { FieldDefinition } from "@/types";
import { Plus, Sparkles, Calculator, Trash2, Wand2, ChevronDown, Search } from "lucide-react";

interface LookupOption {
    field_key: string;
}

interface TransformTabProps {
    fields: FieldDefinition[];
    lookupOptions: LookupOption[];
    skuTemplate: string;
    generateSku: boolean;
    onFieldsChange: (fields: FieldDefinition[]) => void;
    onSkuTemplateChange: (template: string) => void;
    onGenerateSkuChange: (generate: boolean) => void;
}

export function TransformTab({
    fields,
    lookupOptions,
    onFieldsChange,
}: TransformTabProps) {
    const [newComputedKey, setNewComputedKey] = useState("");
    const [computedOpen, setComputedOpen] = useState(true);
    const [catalogOpen, setCatalogOpen] = useState(true);
    const [computedSearch, setComputedSearch] = useState("");
    const [catalogSearch, setCatalogSearch] = useState("");

    // Memoize filtered fields for performance
    const extractedFields = useMemo(() => 
        fields.filter(f => f.source !== 'computed'),
        [fields]
    );
    const computedFields = useMemo(() => 
        fields.filter(f => f.source === 'computed'),
        [fields]
    );
    
    const filteredComputedFields = useMemo(() => 
        computedFields.filter(f => 
            !computedSearch ||
            f.key.toLowerCase().includes(computedSearch.toLowerCase()) ||
            f.label.toLowerCase().includes(computedSearch.toLowerCase())
        ),
        [computedFields, computedSearch]
    );
    
    const filteredCatalogFields = useMemo(() => 
        extractedFields.filter(f => 
            !catalogSearch ||
            f.key.toLowerCase().includes(catalogSearch.toLowerCase()) ||
            f.label.toLowerCase().includes(catalogSearch.toLowerCase())
        ),
        [extractedFields, catalogSearch]
    );

    const handleAddComputedField = () => {
        if (!newComputedKey.trim()) return;
        onFieldsChange([
            ...fields,
            {
                key: newComputedKey.trim().toLowerCase().replace(/\s+/g, '_'),
                label: newComputedKey.trim(),
                type: "text",
                required: false,
                source: "computed",
                logic_type: "template",
                template: "",
            },
        ]);
        setNewComputedKey("");
    };

    const handleFieldUpdate = (key: string, updates: Partial<FieldDefinition>) => {
        onFieldsChange(
            fields.map((f) => (f.key === key ? { ...f, ...updates } : f))
        );
    };

    const handleRemoveComputedField = (key: string) => {
        onFieldsChange(fields.filter((f) => f.key !== key));
    };

    const availableVars = extractedFields.map(f => f.key).filter(Boolean);

    return (
        <div className="space-y-5">
            {/* Add Computed Field */}
            <div className="p-4 border border-dashed rounded-lg bg-muted/30 ring-0">
                <div className="flex items-center gap-2 mb-2">
                    <Wand2 className="h-5 w-5 text-purple-500" />
                    <Label className="text-sm font-medium">Create Virtual Field</Label>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                    Create computed fields for derived values, marketing descriptions, SKUs, etc.
                </p>
                <div className="flex gap-2">
                    <Input
                        value={newComputedKey}
                        onChange={(e) => setNewComputedKey(e.target.value)}
                        placeholder="e.g., sku, shop_description"
                        className="flex-1 h-9"
                        onKeyDown={(e) => e.key === "Enter" && handleAddComputedField()}
                    />
                    <Button size="sm" onClick={handleAddComputedField} disabled={!newComputedKey.trim()} className="gap-1.5 h-9">
                        <Plus className="h-4 w-4" />
                        Add
                    </Button>
                </div>
            </div>

            {/* Computed Fields List - Collapsible */}
            {computedFields.length > 0 && (
                <Collapsible open={computedOpen} onOpenChange={setComputedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${computedOpen ? '' : '-rotate-90'}`} />
                        <Label className="text-sm font-medium cursor-pointer group-hover:text-foreground">
                            Computed Fields ({computedFields.length})
                        </Label>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-3">
                        {/* Search */}
                        {computedFields.length > 3 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search computed fields..."
                                    value={computedSearch}
                                    onChange={(e) => setComputedSearch(e.target.value)}
                                    className="pl-8 h-8 text-sm"
                                />
                            </div>
                        )}
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                            {filteredComputedFields.map((field) => (
                                <Collapsible key={field.key} defaultOpen={false}>
                                    <div className="border rounded-lg bg-muted/30 ring-1 ring-inset ring-border/50">
                                        <CollapsibleTrigger className="flex items-center gap-2 p-3 w-full text-left hover:bg-muted/50 transition-colors group">
                                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleFieldUpdate(field.key, { 
                                                        source: 'extracted', 
                                                        logic_type: undefined,
                                                        template: undefined,
                                                        ai_prompt: undefined,
                                                    });
                                                }}
                                                className="text-[10px] px-2 py-1 rounded-lg bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wide hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                                                title="Click to convert to Source field"
                                            >
                                                V
                                            </button>
                                            <span className="font-medium text-sm">{field.label || field.key}</span>
                                            <span className="text-xs text-muted-foreground font-mono">({field.key})</span>
                                            {field.logic_type === 'ai_enrichment' && (
                                                <span className="p-1 rounded bg-muted" title="AI Enrichment">
                                                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                                </span>
                                            )}
                                            {field.logic_type === 'template' && (
                                                <span className="p-1 rounded bg-muted" title="Template">
                                                    <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                                                </span>
                                            )}
                                            <div className="flex-1" />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveComputedField(field.key);
                                                }}
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </CollapsibleTrigger>
                                        
                                        <CollapsibleContent>
                                            <div className="px-4 pb-4 pt-2 space-y-3">
                                                {/* Logic Type */}
                                                <div className="flex items-center gap-3">
                                                    <Select
                                                        value={field.logic_type || "template"}
                                                        onValueChange={(value) =>
                                                            handleFieldUpdate(field.key, {
                                                                logic_type: value as FieldDefinition["logic_type"],
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger className="w-44 h-8 text-sm">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">
                                                                <span className="flex items-center gap-2">None (Empty)</span>
                                                            </SelectItem>
                                                            <SelectItem value="template">
                                                                <span className="flex items-center gap-2">
                                                                    <Calculator className="h-3 w-3" /> Template
                                                                </span>
                                                            </SelectItem>
                                                            <SelectItem value="ai_enrichment">
                                                                <span className="flex items-center gap-2">
                                                                    <Sparkles className="h-3 w-3" /> AI Enrichment
                                                                </span>
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* Template Input */}
                                                {field.logic_type === "template" && (
                                                    <div className="space-y-1">
                                                        <TemplateInput
                                                            value={field.template || ""}
                                                            onChange={(v) =>
                                                                handleFieldUpdate(field.key, { template: v })
                                                            }
                                                            variables={availableVars}
                                                            placeholder="{brand}-{category:2}{color:2}{sequence:3}"
                                                            className="h-8"
                                                        />
                                                        <p className="text-[11px] text-muted-foreground">
                                                            Type {'{'} to insert variables
                                                        </p>
                                                    </div>
                                                )}

                                                {/* AI Prompt */}
                                                {field.logic_type === "ai_enrichment" && (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <Sparkles className="h-4 w-4 text-amber-500" />
                                                            <Label className="text-xs font-medium">AI Prompt</Label>
                                                        </div>
                                                        <textarea
                                                            value={field.ai_prompt || ""}
                                                            onChange={(e) =>
                                                                handleFieldUpdate(field.key, { ai_prompt: e.target.value })
                                                            }
                                                            placeholder="Write a 2-sentence creative marketing description for this product based on the brand and category."
                                                            className="w-full h-16 rounded-lg border px-3 py-2 text-sm resize-none"
                                                        />
                                                    </div>
                                                )}

                                                {/* Fallback */}
                                                <Input
                                                    value={field.fallback || ""}
                                                    onChange={(e) =>
                                                        handleFieldUpdate(field.key, { fallback: e.target.value })
                                                    }
                                                    placeholder="Fallback value if empty"
                                                    className="text-sm h-8"
                                                />
                                            </div>
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}

            {/* Source Fields - Catalog Matching - Collapsible */}
            {extractedFields.length > 0 && (
                <Collapsible open={catalogOpen} onOpenChange={setCatalogOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${catalogOpen ? '' : '-rotate-90'}`} />
                        <div>
                            <Label className="text-sm font-medium cursor-pointer group-hover:text-foreground">
                                Catalog Matching ({extractedFields.length})
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Link source fields to lookup catalogs for normalization
                            </p>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-3">
                        {/* Search */}
                        {extractedFields.length > 5 && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search fields..."
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                    className="pl-8 h-8 text-sm"
                                />
                            </div>
                        )}
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {filteredCatalogFields.map((field) => (
                                <div
                                    key={field.key}
                                    className="flex items-center gap-3 p-2.5 border rounded-lg text-sm"
                                >
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400 font-medium">
                                        SRC
                                    </span>
                                    <span className="flex-1 font-medium">{field.label || field.key}</span>
                                    
                                    <Select
                                        value={field.catalog_key || "_none"}
                                        onValueChange={(value) =>
                                            handleFieldUpdate(field.key, {
                                                catalog_key: value === "_none" ? undefined : value,
                                            })
                                        }
                                    >
                                        <SelectTrigger className="w-32 h-8 text-sm">
                                            <SelectValue placeholder="No catalog" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="_none">No catalog</SelectItem>
                                            {lookupOptions.map((opt) => (
                                                <SelectItem key={opt.field_key} value={opt.field_key}>
                                                    {opt.field_key}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            )}
        </div>
    );
}

