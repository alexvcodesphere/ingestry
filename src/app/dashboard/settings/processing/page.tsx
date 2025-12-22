"use client";

/**
 * Processing Profiles Settings Page
 * Unified configuration for extraction, normalization, and SKU generation
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
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

interface FieldConfig {
    key: string;
    label: string;
    required?: boolean;
    normalize_with?: string; // lookup type slug
}

interface ProcessingProfile {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    fields: FieldConfig[];
    sku_template?: string;
    generate_sku?: boolean;
    is_default: boolean;
    created_at: string;
}

interface LookupType {
    id: string;
    slug: string;
    label: string;
}

// Default fields available for extraction
const DEFAULT_FIELDS: FieldConfig[] = [
    { key: "name", label: "Product Name", required: true },
    { key: "color", label: "Color" },
    { key: "size", label: "Size" },
    { key: "price", label: "Price", required: true },
    { key: "quantity", label: "Quantity", required: true },
    { key: "ean", label: "EAN/Barcode" },
    { key: "brand", label: "Brand" },
    { key: "category", label: "Category" },
    { key: "sku", label: "SKU" },
    { key: "articleNumber", label: "Article Number" },
    { key: "styleCode", label: "Style Code" },
    { key: "designerCode", label: "Designer Code" },
];

export default function ProcessingProfilesPage() {
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [lookupTypes, setLookupTypes] = useState<LookupType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ProcessingProfile | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Editor form state
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formFields, setFormFields] = useState<FieldConfig[]>([]);
    const [formSkuTemplate, setFormSkuTemplate] = useState("");
    const [formGenerateSku, setFormGenerateSku] = useState(false);
    const [formIsDefault, setFormIsDefault] = useState(false);

    // Custom field creation
    const [newFieldKey, setNewFieldKey] = useState("");
    const [newFieldLabel, setNewFieldLabel] = useState("");

    const fetchProfiles = useCallback(async () => {
        setIsLoading(true);
        const supabase = createClient();

        const { data, error } = await supabase
            .from("processing_profiles")
            .select("*")
            .order("is_default", { ascending: false })
            .order("name");

        if (!error && data) {
            setProfiles(data as ProcessingProfile[]);
        }
        setIsLoading(false);
    }, []);

    const fetchLookupTypes = useCallback(async () => {
        const supabase = createClient();
        const { data } = await supabase
            .from("lookup_types")
            .select("id, slug, label")
            .order("sort_order");
        if (data) {
            setLookupTypes(data);
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
        fetchLookupTypes();
    }, [fetchProfiles, fetchLookupTypes]);

    const openEditor = (profile?: ProcessingProfile) => {
        if (profile) {
            setEditingProfile(profile);
            setFormName(profile.name || "");
            setFormDescription(profile.description || "");
            setFormFields(Array.isArray(profile.fields) ? profile.fields : []);
            setFormSkuTemplate(profile.sku_template || "");
            setFormGenerateSku(profile.generate_sku || false);
            setFormIsDefault(profile.is_default || false);
        } else {
            setEditingProfile(null);
            setFormName("");
            setFormDescription("");
            setFormFields(DEFAULT_FIELDS.slice(0, 8)); // Start with common fields
            setFormSkuTemplate("{brand:2}{category:2}{colour:2}{sequence:3}-{size}");
            setFormGenerateSku(false);
            setFormIsDefault(false);
        }
        // Reset custom field inputs
        setNewFieldKey("");
        setNewFieldLabel("");
        setIsEditorOpen(true);
    };

    const toggleField = (field: FieldConfig) => {
        const exists = formFields.find(f => f.key === field.key);
        if (exists) {
            setFormFields(formFields.filter(f => f.key !== field.key));
        } else {
            setFormFields([...formFields, { ...field }]);
        }
    };

    const updateFieldNormalization = (key: string, lookupSlug: string | null) => {
        setFormFields(formFields.map(f =>
            f.key === key
                ? { ...f, normalize_with: lookupSlug || undefined }
                : f
        ));
    };

    const addCustomField = () => {
        if (!newFieldKey.trim() || !newFieldLabel.trim()) return;
        const key = newFieldKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (formFields.some(f => f.key === key) || DEFAULT_FIELDS.some(f => f.key === key)) {
            alert("A field with this key already exists");
            return;
        }
        setFormFields([...formFields, { key, label: newFieldLabel.trim() }]);
        setNewFieldKey("");
        setNewFieldLabel("");
    };

    const removeCustomField = (key: string) => {
        setFormFields(formFields.filter(f => f.key !== key));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            // Get tenant_id
            const tenantId = profiles[0]?.tenant_id;
            let finalTenantId = tenantId;

            if (!finalTenantId) {
                const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
                finalTenantId = tenantData;
            }

            const profileData = {
                name: formName,
                description: formDescription || null,
                fields: formFields,
                sku_template: formSkuTemplate,
                generate_sku: formGenerateSku,
                is_default: formIsDefault,
            };

            if (editingProfile) {
                const { error } = await supabase
                    .from("processing_profiles")
                    .update(profileData)
                    .eq("id", editingProfile.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("processing_profiles")
                    .insert({ ...profileData, tenant_id: finalTenantId });
                if (error) throw error;
            }

            // If setting as default, unset others
            if (formIsDefault && finalTenantId) {
                await supabase
                    .from("processing_profiles")
                    .update({ is_default: false })
                    .eq("tenant_id", finalTenantId)
                    .neq("name", formName);
            }

            setIsEditorOpen(false);
            await fetchProfiles();
        } catch (error) {
            console.error("Failed to save profile:", error);
            alert("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this profile?")) return;

        const supabase = createClient();
        await supabase.from("processing_profiles").delete().eq("id", id);
        await fetchProfiles();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold">Processing Profiles</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure what fields to extract, how to normalize them, and SKU generation
                    </p>
                </div>
                <Button onClick={() => openEditor()}>+ New Profile</Button>
            </div>

            {profiles.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        No profiles configured yet. Create one to get started.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {profiles.map((profile) => (
                        <Card key={profile.id} className={profile.is_default ? "border-primary" : ""}>
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        {profile.is_default && <span className="text-yellow-500">⭐</span>}
                                        {profile.name}
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => openEditor(profile)}>
                                            Edit
                                        </Button>
                                        {!profile.is_default && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500"
                                                onClick={() => handleDelete(profile.id)}
                                            >
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                                    <div>
                                        <span className="font-medium">Fields:</span>{" "}
                                        {profile.fields.map(f => f.label).join(", ")}
                                    </div>
                                    {profile.sku_template && (
                                        <div>
                                            <span className="font-medium">SKU:</span>{" "}
                                            <code className="bg-muted px-1 rounded">{profile.sku_template}</code>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Profile Editor Dialog */}
            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingProfile ? `Edit: ${editingProfile.name}` : "New Processing Profile"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Profile Name</Label>
                                <Input
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="e.g., Default Profile"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Optional description"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="is_default"
                                checked={formIsDefault}
                                onCheckedChange={(v) => setFormIsDefault(!!v)}
                            />
                            <Label htmlFor="is_default">Set as default profile</Label>
                        </div>

                        {/* Fields to Extract */}
                        <div className="space-y-4">
                            <div>
                                <Label className="text-base font-semibold">Fields to Extract</Label>
                                <p className="text-sm text-muted-foreground">
                                    Select which fields GPT should look for. Link to lookups for normalization.
                                </p>
                            </div>

                            {/* Default fields - single column for clarity */}
                            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                                {DEFAULT_FIELDS.map((field) => {
                                    const isSelected = formFields.some(f => f.key === field.key);
                                    const selectedField = formFields.find(f => f.key === field.key);

                                    return (
                                        <div key={field.key} className={`flex items-center gap-4 p-3 rounded-md transition-colors ${isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'}`}>
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => toggleField(field)}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="font-medium">{field.label}</span>
                                                <span className="text-xs text-muted-foreground ml-2">({field.key})</span>
                                            </div>
                                            {isSelected && (
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">Normalize with:</span>
                                                    <Select
                                                        value={selectedField?.normalize_with || "none"}
                                                        onValueChange={(v) => updateFieldNormalization(field.key, v === "none" ? null : v)}
                                                    >
                                                        <SelectTrigger className="w-36 h-8">
                                                            <SelectValue placeholder="None" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">None</SelectItem>
                                                            {lookupTypes.map(lt => (
                                                                <SelectItem key={lt.slug} value={lt.slug}>
                                                                    {lt.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Custom fields section */}
                            {formFields.filter(f => !DEFAULT_FIELDS.some(d => d.key === f.key)).length > 0 && (
                                <div className="mt-4 border rounded-lg p-3 bg-muted/30">
                                    <Label className="text-sm font-medium">Custom Fields</Label>
                                    <div className="space-y-2 mt-2">
                                        {formFields
                                            .filter(f => !DEFAULT_FIELDS.some(d => d.key === f.key))
                                            .map((field) => (
                                                <div key={field.key} className="flex items-center gap-4 p-3 bg-background rounded-md border">
                                                    <div className="flex-1">
                                                        <span className="font-medium">{field.label}</span>
                                                        <span className="text-xs text-muted-foreground ml-2">({field.key})</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">Normalize:</span>
                                                        <Select
                                                            value={field.normalize_with || "none"}
                                                            onValueChange={(v) => updateFieldNormalization(field.key, v === "none" ? null : v)}
                                                        >
                                                            <SelectTrigger className="w-36 h-8">
                                                                <SelectValue placeholder="None" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="none">None</SelectItem>
                                                                {lookupTypes.map(lt => (
                                                                    <SelectItem key={lt.slug} value={lt.slug}>
                                                                        {lt.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-500"
                                                        onClick={() => removeCustomField(field.key)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Add custom field - clearer layout */}
                            <div className="border-t pt-4 mt-4">
                                <Label className="text-sm font-medium mb-2 block">Add Custom Field</Label>
                                <div className="flex items-end gap-3">
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Display Name</Label>
                                        <Input
                                            value={newFieldLabel}
                                            onChange={(e) => setNewFieldLabel(e.target.value)}
                                            placeholder="e.g., Material"
                                        />
                                    </div>
                                    <div className="w-40 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Field Key</Label>
                                        <Input
                                            value={newFieldKey}
                                            onChange={(e) => setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                            placeholder="material"
                                            className="font-mono"
                                        />
                                    </div>
                                    <Button
                                        onClick={addCustomField}
                                        disabled={!newFieldKey.trim() || !newFieldLabel.trim()}
                                    >
                                        + Add Field
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* SKU Generation */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="generate-sku"
                                    checked={formGenerateSku}
                                    onChange={(e) => setFormGenerateSku(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300"
                                />
                                <Label htmlFor="generate-sku" className="text-base font-semibold cursor-pointer">
                                    Generate SKU
                                </Label>
                            </div>

                            {formGenerateSku && (
                                <>
                                    <p className="text-sm text-muted-foreground">
                                        Define how SKUs are generated. Use {`{variable:length}`} syntax.
                                    </p>
                                    <Input
                                        value={formSkuTemplate}
                                        onChange={(e) => setFormSkuTemplate(e.target.value)}
                                        placeholder="{brand:2}{category:2}{colour:2}{sequence:3}-{size}"
                                        className="font-mono"
                                    />
                                    <div className="text-xs text-muted-foreground">
                                        Available: {lookupTypes.map(lt => `{${lt.slug}}`).join(", ")},
                                        {" "}{`{size}`}, {`{sequence}`}, {`{year}`}, {`{ean}`}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || !formName}>
                            {isSaving ? "Saving..." : "Save Profile"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
