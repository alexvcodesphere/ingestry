"use client";

/**
 * Code Lookups Settings Page
 * Manage brand, category, colour, and other code mappings.
 * Brands tab reads from `suppliers` table; others from `code_lookups`.
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
import type { CodeLookup, Supplier } from "@/types";

// Type config for tabs
interface LookupTypeConfig {
    value: string;
    label: string;
    description: string;
    table: "suppliers" | "code_lookups";
}

const LOOKUP_TYPES: LookupTypeConfig[] = [
    { value: "brand", label: "Brands", description: "Brand/supplier mappings", table: "suppliers" },
    { value: "category", label: "Categories", description: "Category name to code mappings", table: "code_lookups" },
    { value: "colour", label: "Colours", description: "Colour name to code mappings", table: "code_lookups" },
];

// Combined type for display
type LookupItem = {
    id: string;
    name: string;
    code: string;
    supplier_name?: string;
    aliases?: string[];
    created_at?: string;
};

export default function CodeLookupsPage() {
    const [activeType, setActiveType] = useState("brand");
    const [lookups, setLookups] = useState<LookupItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLookup, setEditingLookup] = useState<LookupItem | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        code: "",
        supplier_name: "",
        aliases: "",
    });
    const [searchQuery, setSearchQuery] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const activeConfig = LOOKUP_TYPES.find(t => t.value === activeType)!;
    const isBrandsTab = activeType === "brand";

    const fetchLookups = useCallback(async (type: string) => {
        setIsLoading(true);
        const supabase = createClient();
        const config = LOOKUP_TYPES.find(t => t.value === type)!;

        if (config.table === "suppliers") {
            // Fetch from suppliers table
            const { data, error } = await supabase
                .from("suppliers")
                .select("*")
                .order("brand_name");

            if (!error && data) {
                // Map to LookupItem format
                setLookups(data.map((s: Supplier) => ({
                    id: s.id,
                    name: s.brand_name,
                    code: s.brand_code,
                    supplier_name: s.supplier_name,
                    created_at: s.created_at,
                })));
            }
        } else {
            // Fetch from code_lookups table
            const { data, error } = await supabase
                .from("code_lookups")
                .select("*")
                .eq("type", type)
                .order("sort_order");

            if (!error && data) {
                setLookups(data.map((l: CodeLookup) => ({
                    id: l.id,
                    name: l.name,
                    code: l.code,
                    aliases: l.aliases,
                })));
            }
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchLookups(activeType);
        setSearchQuery("");
    }, [activeType, fetchLookups]);

    const handleOpenDialog = (lookup?: LookupItem) => {
        if (lookup) {
            setEditingLookup(lookup);
            setFormData({
                name: lookup.name,
                code: lookup.code,
                supplier_name: lookup.supplier_name || "",
                aliases: lookup.aliases?.join(", ") || "",
            });
        } else {
            setEditingLookup(null);
            setFormData({ name: "", code: "", supplier_name: "", aliases: "" });
        }
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            if (isBrandsTab) {
                // Save to suppliers table
                const supplierData = {
                    brand_name: formData.name,
                    supplier_name: formData.supplier_name,
                    brand_code: formData.code.toUpperCase(),
                };

                if (editingLookup) {
                    const { error } = await supabase
                        .from("suppliers")
                        .update(supplierData)
                        .eq("id", editingLookup.id);
                    if (error) throw error;
                } else {
                    const { error } = await supabase
                        .from("suppliers")
                        .insert(supplierData);
                    if (error) throw error;
                }
            } else {
                // Save to code_lookups table
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
                            type: activeType,
                            name: formData.name,
                            code: formData.code.toUpperCase(),
                            aliases: aliasArray,
                        });
                    if (error) throw error;
                }
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
        const table = isBrandsTab ? "suppliers" : "code_lookups";
        await supabase.from(table).delete().eq("id", id);
        await fetchLookups(activeType);
    };

    // Filter lookups by search
    const filteredLookups = lookups.filter(l =>
        l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Determine if save button should be disabled
    const isSaveDisabled = isSaving || !formData.name || !formData.code ||
        (isBrandsTab && !formData.supplier_name);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold">Code Lookups</h3>
                <p className="text-sm text-muted-foreground">
                    Manage mappings from names to codes for SKU generation
                </p>
            </div>

            <Tabs value={activeType} onValueChange={setActiveType}>
                <TabsList>
                    {LOOKUP_TYPES.map(type => (
                        <TabsTrigger key={type.value} value={type.value}>
                            {type.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {LOOKUP_TYPES.map(type => (
                    <TabsContent key={type.value} value={type.value} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Input
                                placeholder={`Search ${type.label.toLowerCase()}...`}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="max-w-xs"
                            />
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
                                                <TableHead>
                                                    {type.table === "suppliers" ? "Brand Name" : "Name"}
                                                </TableHead>
                                                {type.table === "suppliers" && (
                                                    <TableHead>Supplier Name</TableHead>
                                                )}
                                                <TableHead>Code</TableHead>
                                                {type.table === "code_lookups" && (
                                                    <TableHead>Aliases</TableHead>
                                                )}
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredLookups.map((lookup) => (
                                                <TableRow key={lookup.id}>
                                                    <TableCell className="font-medium">
                                                        {lookup.name}
                                                    </TableCell>
                                                    {type.table === "suppliers" && (
                                                        <TableCell>{lookup.supplier_name}</TableCell>
                                                    )}
                                                    <TableCell>
                                                        <code className="bg-muted px-2 py-0.5 rounded">
                                                            {lookup.code}
                                                        </code>
                                                    </TableCell>
                                                    {type.table === "code_lookups" && (
                                                        <TableCell className="text-muted-foreground text-sm">
                                                            {lookup.aliases?.join(", ") || "-"}
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-right space-x-1">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleOpenDialog(lookup)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(lookup.id)}
                                                            className="text-red-500"
                                                        >
                                                            Delete
                                                        </Button>
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

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editingLookup ? `Edit ${activeConfig.label.slice(0, -1)}` : `Add ${activeConfig.label.slice(0, -1)}`}
                        </DialogTitle>
                        <DialogDescription>
                            {isBrandsTab
                                ? "Map a brand to its supplier and code"
                                : "Map a name to a code for SKU generation"}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">
                                {isBrandsTab ? "Brand Name" : "Name"}
                            </Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder={isBrandsTab ? "e.g., Acne Studios" : "e.g., Outerwear"}
                            />
                        </div>

                        {isBrandsTab && (
                            <div className="space-y-2">
                                <Label htmlFor="supplier_name">Supplier Name</Label>
                                <Input
                                    id="supplier_name"
                                    value={formData.supplier_name}
                                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                    placeholder="e.g., ACNE STUDIOS AB"
                                />
                                <p className="text-xs text-muted-foreground">
                                    The legal entity name of the supplier
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="code">Code</Label>
                            <Input
                                id="code"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                placeholder={isBrandsTab ? "e.g., AC" : "e.g., 01"}
                                maxLength={10}
                            />
                            {isBrandsTab && (
                                <p className="text-xs text-muted-foreground">
                                    2-4 character code used in SKU generation
                                </p>
                            )}
                        </div>

                        {!isBrandsTab && (
                            <div className="space-y-2">
                                <Label htmlFor="aliases">Aliases (comma-separated)</Label>
                                <Input
                                    id="aliases"
                                    value={formData.aliases}
                                    onChange={(e) => setFormData({ ...formData, aliases: e.target.value })}
                                    placeholder="e.g., jacket, jackets"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Alternative names that should map to the same code
                                </p>
                            </div>
                        )}
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
        </div>
    );
}
