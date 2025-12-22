"use client";

/**
 * Code Lookups Settings Page
 * Manage global lookup entries (brand, category, color, custom, etc.)
 * Lookups are keyed by field_key and shared across all profiles.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { Trash2 } from "lucide-react";
import type { CodeLookup } from "@/types";

// Simple field key info for tabs
interface FieldKeyInfo {
    field_key: string;
    count: number;
}

// Combined type for display
type LookupItem = {
    id: string;
    name: string;
    code: string;
    aliases?: string[];
    created_at?: string;
};

export default function CodeLookupsPage() {
    const [fieldDefinitions, setFieldDefinitions] = useState<FieldKeyInfo[]>([]);
    const [activeType, setActiveType] = useState<string>("");
    const [lookups, setLookups] = useState<LookupItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isTypesLoading, setIsTypesLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLookup, setEditingLookup] = useState<LookupItem | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        aliases: "",
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Type management state
    const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
    const [typeFormData, setTypeFormData] = useState({
        label: "",
        slug: "",
        description: "",
    });
    const [isTypeSaving, setIsTypeSaving] = useState(false);

    // Test normalization state
    const [testInput, setTestInput] = useState("");
    const [testResult, setTestResult] = useState<{
        normalized: string;
        code: string;
        matchType: 'exact' | 'alias' | 'fuzzy' | 'compound' | 'none';
        matchedEntry?: { name: string; aliases?: string[] };
        distance?: number;
        originalPart?: string;
    } | null>(null);
    const [isTesting, setIsTesting] = useState(false);

    // Get unique field_keys from code_lookups
    const fetchFieldKeys = useCallback(async () => {
        setIsTypesLoading(true);
        const supabase = createClient();

        // Get distinct field_keys from code_lookups
        const { data, error } = await supabase
            .from("code_lookups")
            .select("field_key")
            .order("field_key");

        if (!error && data) {
            // Get unique field_keys with counts
            const keyMap = new Map<string, number>();
            data.forEach(row => {
                keyMap.set(row.field_key, (keyMap.get(row.field_key) || 0) + 1);
            });
            const fieldKeys = Array.from(keyMap.entries()).map(([field_key, count]) => ({ field_key, count }));
            setFieldDefinitions(fieldKeys);
            if (!activeType && fieldKeys.length > 0) {
                setActiveType(fieldKeys[0].field_key);
            }
        }
        setIsTypesLoading(false);
    }, [activeType]);

    useEffect(() => {
        fetchFieldKeys();
    }, [fetchFieldKeys]);

    const activeConfig = fieldDefinitions.find(f => f.field_key === activeType);

    // Fetch lookup values - all types use code_lookups table
    const fetchLookups = useCallback(async (typeSlug: string) => {
        if (!typeSlug) return;

        setIsLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
            .from("code_lookups")
            .select("*")
            .eq("field_key", typeSlug)
            .order("sort_order");

        if (!error && data) {
            setLookups(data.map((l: CodeLookup) => ({
                id: l.id,
                name: l.name,
                code: l.code,
                aliases: l.aliases,
            })));
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (activeType) {
            fetchLookups(activeType);
            setSearchQuery("");
            // Reset test when switching types
            setTestInput("");
            setTestResult(null);
        }
    }, [activeType, fetchLookups]);

    // Test normalization
    const handleTestNormalization = async () => {
        if (!testInput.trim() || !activeType || activeType === 'brand') return;

        setIsTesting(true);
        try {
            const response = await fetch('/api/lookups/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: testInput, lookupType: activeType }),
            });
            const result = await response.json();
            setTestResult(result);
        } catch (error) {
            console.error('Test failed:', error);
        } finally {
            setIsTesting(false);
        }
    };

    const handleOpenDialog = (lookup?: LookupItem) => {
        if (lookup) {
            setEditingLookup(lookup);
            setFormData({
                name: lookup.name,
                code: lookup.code,
                aliases: lookup.aliases?.join(", ") || "",
            });
        } else {
            setEditingLookup(null);
            setFormData({ name: "", code: "", aliases: "" });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            const aliasArray = formData.aliases
                .split(",")
                .map(a => a.trim())
                .filter(a => a.length > 0);

            // Get tenant_id via RPC
            const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

            if (editingLookup) {
                const { error } = await supabase
                    .from("code_lookups")
                    .update({
                        name: formData.name,
                        code: formData.code.toUpperCase(),
                        aliases: aliasArray,
                    })
                    .eq("id", editingLookup.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("code_lookups")
                    .insert({
                        tenant_id: tenantId,
                        field_key: activeType,
                        name: formData.name,
                        code: formData.code.toUpperCase(),
                        aliases: aliasArray,
                    });
                if (error) throw error;
            }
            setIsDialogOpen(false);
            await fetchLookups(activeType);
            await fetchFieldKeys(); // Refresh counts
        } catch (error) {
            console.error("Failed to save:", error);
            alert("Failed to save. The name might already exist.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this item?")) return;

        const supabase = createClient();
        await supabase.from("code_lookups").delete().eq("id", id);
        await fetchLookups(activeType);
    };

    // Create a new lookup type (just inserts a placeholder entry)
    const handleCreateType = async () => {
        setIsTypeSaving(true);
        const supabase = createClient();

        const newFieldKey = typeFormData.slug || typeFormData.label.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        // Get tenant_id via RPC
        const { data: tenantId } = await supabase.rpc('get_user_tenant_id');

        if (!tenantId) {
            alert("No tenant found. Please contact support.");
            setIsTypeSaving(false);
            return;
        }

        try {
            // Insert a placeholder entry to create this field_key
            const { error } = await supabase
                .from("code_lookups")
                .insert({
                    tenant_id: tenantId,
                    field_key: newFieldKey,
                    name: "Example",
                    code: "00",
                    aliases: [],
                });

            if (error) throw error;

            setIsTypeDialogOpen(false);
            setTypeFormData({ label: "", slug: "", description: "" });
            await fetchFieldKeys();
            setActiveType(newFieldKey);
        } catch (error) {
            console.error("Failed to create lookup type:", error);
            alert("Failed to create. The key might already exist.");
        } finally {
            setIsTypeSaving(false);
        }
    };

    const handleDeleteType = async (fieldKey: string) => {
        if (!confirm(`Delete all "${fieldKey}" lookup entries?`)) return;

        const supabase = createClient();
        await supabase.from("code_lookups").delete().eq("field_key", fieldKey);

        await fetchFieldKeys();
        if (fieldDefinitions.length > 1) {
            const remaining = fieldDefinitions.find(f => f.field_key !== fieldKey);
            setActiveType(remaining?.field_key || "");
        } else {
            setActiveType("");
        }
    };

    // Filter lookups by search
    const filteredLookups = lookups.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())))
    );

    const isSaveDisabled = isSaving || !formData.name || !formData.code;

    if (isTypesLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (fieldDefinitions.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-semibold">Code Lookups</h3>
                    <p className="text-sm text-muted-foreground">
                        No lookup types configured yet.
                    </p>
                </div>
                <Button onClick={() => setIsTypeDialogOpen(true)}>
                    Create First Lookup Type
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold">Code Lookups</h3>
                    <p className="text-sm text-muted-foreground">
                        Normalize extracted values and generate SKU codes. Add entries with aliases to handle variations.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {activeConfig && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteType(activeConfig.field_key)}
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            title="Delete lookup type"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => setIsTypeDialogOpen(true)}>
                        + Add Field
                    </Button>
                </div>
            </div>

            {/* Test Normalization Panel */}
            {activeType && activeType !== 'brand' && (
                <Card className="bg-muted/30">
                    <CardContent className="py-4">
                        <div className="flex items-start gap-6">
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Test Normalization</Label>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Type a value to see how it would be normalized (supports fuzzy matching for typos)
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        value={testInput}
                                        onChange={(e) => setTestInput(e.target.value)}
                                        placeholder={`e.g., "Navy Blue", "Navvy", "bleu marine"`}
                                        className="max-w-xs"
                                        onKeyDown={(e) => e.key === 'Enter' && handleTestNormalization()}
                                    />
                                    <Button
                                        onClick={handleTestNormalization}
                                        disabled={isTesting || !testInput.trim()}
                                        variant="secondary"
                                    >
                                        {isTesting ? 'Testing...' : 'Test'}
                                    </Button>
                                </div>
                            </div>
                            {testResult && (
                                <div className="flex-1 border-l pl-6">
                                    <div className="space-y-1 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground">Result:</span>
                                            <span className="font-medium">{testResult.normalized}</span>
                                            {testResult.code && (
                                                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                                                    {testResult.code}
                                                </code>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-muted-foreground">Match:</span>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${testResult.matchType === 'exact' ? 'bg-green-100 text-green-800' :
                                                testResult.matchType === 'alias' ? 'bg-blue-100 text-blue-800' :
                                                    testResult.matchType === 'fuzzy' ? 'bg-yellow-100 text-yellow-800' :
                                                        testResult.matchType === 'compound' ? 'bg-purple-100 text-purple-800' :
                                                            'bg-gray-100 text-gray-600'
                                                }`}>
                                                {testResult.matchType === 'none' ? 'No match' : testResult.matchType}
                                                {testResult.matchType === 'fuzzy' && testResult.distance !== undefined && ` (dist: ${testResult.distance})`}
                                                {testResult.matchType === 'compound' && testResult.originalPart && ` (from "${testResult.originalPart}")`}
                                            </span>
                                        </div>
                                        {testResult.matchType === 'none' && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                No matching entry found. Consider adding an alias.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Tabs value={activeType} onValueChange={setActiveType}>
                <TabsList className="flex-wrap h-auto gap-1">
                    {fieldDefinitions.map((field: FieldKeyInfo) => (
                        <TabsTrigger key={field.field_key} value={field.field_key}>
                            {field.field_key} ({field.count})
                        </TabsTrigger>
                    ))}
                </TabsList>

                {fieldDefinitions.map((field: FieldKeyInfo) => (
                    <TabsContent key={field.field_key} value={field.field_key} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Input
                                    placeholder={`Search ${field.field_key}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="max-w-xs"
                                />
                                {field.field_key && (
                                    <span className="text-xs text-muted-foreground">
                                        Template: <code className="bg-muted px-1 rounded">{`{${field.field_key}}`}</code>
                                    </span>
                                )}
                            </div>
                            <Button onClick={() => handleOpenDialog()}>
                                Add {field.field_key}
                            </Button>
                        </div>

                        <Card>
                            <CardContent className="p-0">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    </div>
                                ) : filteredLookups.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        No {field.field_key} found
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Code</TableHead>
                                                <TableHead>Aliases</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredLookups.map((lookup) => (
                                                <TableRow key={lookup.id}>
                                                    <TableCell className="font-medium">
                                                        {lookup.name}
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="bg-muted px-2 py-0.5 rounded">
                                                            {lookup.code}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {lookup.aliases?.join(", ") || "-"}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleOpenDialog(lookup)}
                                                            >
                                                                Edit
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleDelete(lookup.id)}
                                                                className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>

            {/* Add/Edit Lookup Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingLookup ? `Edit ${activeType}` : `Add ${activeType}`}
                        </DialogTitle>
                        <DialogDescription>
                            Create a canonical entry. Aliases allow variations like typos or other languages to map here.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Navy"
                            />
                            <p className="text-xs text-muted-foreground">
                                The canonical value. Extracted text will be normalized to this.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="code">Code</Label>
                            <Input
                                id="code"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                placeholder="e.g., 01"
                                maxLength={10}
                            />
                            {activeConfig?.field_key && (
                                <p className="text-xs text-muted-foreground">
                                    Used in SKU template as <code className="bg-muted px-1 rounded">{`{${activeConfig.field_key}}`}</code>
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="aliases">Aliases (comma-separated)</Label>
                            <Input
                                id="aliases"
                                value={formData.aliases}
                                onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                                placeholder="e.g., jacket, jackets"
                            />
                            <p className="text-xs text-muted-foreground">
                                Variations that should normalize to this entry (synonyms, typos, other languages). Fuzzy matching also handles minor typos automatically.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaveDisabled}>
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Lookup Type Dialog */}
            <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Custom Lookup Type</DialogTitle>
                        <DialogDescription>
                            Create a new lookup type for custom code mappings
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="type_label">Label</Label>
                            <Input
                                id="type_label"
                                value={typeFormData.label}
                                onChange={(e) => setTypeFormData({
                                    ...typeFormData,
                                    label: e.target.value,
                                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_')
                                })}
                                placeholder="e.g., Materials"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="type_slug">Variable Name (for templates)</Label>
                            <Input
                                id="type_slug"
                                value={typeFormData.slug}
                                onChange={(e) => setTypeFormData({ ...typeFormData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                placeholder="e.g., material"
                            />
                            <p className="text-xs text-muted-foreground">
                                Use in SKU templates as <code className="bg-muted px-1 rounded">{`{${typeFormData.slug || 'variable'}}`}</code>
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="type_description">Description (optional)</Label>
                            <Input
                                id="type_description"
                                value={typeFormData.description}
                                onChange={(e) => setTypeFormData({ ...typeFormData, description: e.target.value })}
                                placeholder="e.g., Material codes for fabric composition"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsTypeDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateType}
                            disabled={isTypeSaving || !typeFormData.label}
                        >
                            {isTypeSaving ? "Creating..." : "Create Type"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
