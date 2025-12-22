"use client";

/**
 * Code Lookups Settings Page
 * Manage dynamic lookup types (brand, category, colour, custom, etc.)
 * Fetches lookup_types from database for multi-tenant support.
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

// Lookup type from database
interface LookupType {
    id: string;
    tenant_id: string;
    slug: string;
    label: string;
    description?: string;
    is_system: boolean;
    variable_name?: string;
    sort_order: number;
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
    const [lookupTypes, setLookupTypes] = useState<LookupType[]>([]);
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

    const activeConfig = lookupTypes.find(t => t.slug === activeType);

    // Fetch lookup types from database
    const fetchLookupTypes = useCallback(async () => {
        setIsTypesLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
            .from("lookup_types")
            .select("*")
            .order("sort_order");

        if (!error && data && data.length > 0) {
            setLookupTypes(data);
            if (!activeType) {
                setActiveType(data[0].slug);
            }
        }
        setIsTypesLoading(false);
    }, [activeType]);

    useEffect(() => {
        fetchLookupTypes();
    }, [fetchLookupTypes]);

    // Fetch lookup values - all types use code_lookups table
    const fetchLookups = useCallback(async (typeSlug: string) => {
        if (!typeSlug) return;

        setIsLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
            .from("code_lookups")
            .select("*")
            .eq("type", typeSlug)
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
            // All types use code_lookups table
            const tenantId = lookupTypes[0]?.tenant_id;
            const aliasArray = formData.aliases
                .split(",")
                .map(a => a.trim())
                .filter(a => a.length > 0);

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
                        type: activeType,
                        name: formData.name,
                        code: formData.code.toUpperCase(),
                        aliases: aliasArray,
                    });
                if (error) throw error;
            }
            setIsDialogOpen(false);
            await fetchLookups(activeType);
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

    // Type management handlers
    const handleCreateType = async () => {
        setIsTypeSaving(true);
        const supabase = createClient();

        const slug = typeFormData.slug || typeFormData.label.toLowerCase().replace(/[^a-z0-9]/g, '_');

        // Get tenant_id from existing lookup type or via RPC
        let tenantId = lookupTypes[0]?.tenant_id;
        if (!tenantId) {
            const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
            tenantId = tenantData;
        }

        if (!tenantId) {
            alert("No tenant found. Please contact support.");
            setIsTypeSaving(false);
            return;
        }

        try {
            const { error } = await supabase
                .from("lookup_types")
                .insert({
                    tenant_id: tenantId,
                    slug,
                    label: typeFormData.label,
                    description: typeFormData.description || null,
                    variable_name: slug,
                    is_system: false,
                    sort_order: lookupTypes.length + 1,
                });

            if (error) throw error;

            setIsTypeDialogOpen(false);
            setTypeFormData({ label: "", slug: "", description: "" });
            await fetchLookupTypes();
            setActiveType(slug);
        } catch (error) {
            console.error("Failed to create type:", error);
            alert("Failed to create lookup type. The name might already exist.");
        } finally {
            setIsTypeSaving(false);
        }
    };

    const handleDeleteType = async (typeId: string, typeSlug: string) => {
        if (!confirm("Delete this lookup type and all its values?")) return;

        const supabase = createClient();

        // Delete the type (cascades to lookup values via FK)
        await supabase.from("lookup_types").delete().eq("id", typeId);
        await supabase.from("code_lookups").delete().eq("type", typeSlug);

        await fetchLookupTypes();
        if (lookupTypes.length > 1) {
            setActiveType(lookupTypes.find(t => t.id !== typeId)?.slug || "");
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

    if (lookupTypes.length === 0) {
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
                    {activeConfig && !activeConfig.is_system && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteType(activeConfig.id, activeConfig.slug)}
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            title="Delete lookup type"
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => setIsTypeDialogOpen(true)}>
                        + Add Lookup Type
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
                    {lookupTypes.map(type => (
                        <TabsTrigger key={type.slug} value={type.slug}>
                            {type.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {lookupTypes.map(type => (
                    <TabsContent key={type.slug} value={type.slug} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Input
                                    placeholder={`Search ${type.label.toLowerCase()}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="max-w-xs"
                                />
                                {type.variable_name && (
                                    <span className="text-xs text-muted-foreground">
                                        Template: <code className="bg-muted px-1 rounded">{`{${type.variable_name}}`}</code>
                                    </span>
                                )}
                            </div>
                            <Button onClick={() => handleOpenDialog()}>
                                Add {type.label.slice(0, -1)}
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
                                        No {type.label.toLowerCase()} found
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
                            {editingLookup ? `Edit ${activeConfig?.label.slice(0, -1)}` : `Add ${activeConfig?.label.slice(0, -1)}`}
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
                            {activeConfig?.variable_name && (
                                <p className="text-xs text-muted-foreground">
                                    Used in SKU template as <code className="bg-muted px-1 rounded">{`{${activeConfig.variable_name}}`}</code>
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
