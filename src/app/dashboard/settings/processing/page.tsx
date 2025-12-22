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
    normalize_with?: string; // lookup field_key for normalization
    use_template?: boolean;  // if true, value is computed from template
    template?: string;       // template string e.g. "{brand} - {name}"
}

interface ProcessingProfile {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    fields: FieldConfig[];
    is_default: boolean;
    created_at: string;
}

// Available lookup types (from code_lookups.field_key)
interface LookupOption {
    field_key: string;
}

// No default fields - all fields are user-defined

export default function ProcessingProfilesPage() {
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ProcessingProfile | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Editor form state
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formFields, setFormFields] = useState<FieldConfig[]>([]);
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

    const fetchLookupOptions = useCallback(async () => {
        const supabase = createClient();
        const { data } = await supabase
            .from("code_lookups")
            .select("field_key");
        if (data) {
            // Get unique field_keys
            const uniqueKeys = [...new Set(data.map(d => d.field_key))];
            setLookupOptions(uniqueKeys.map(k => ({ field_key: k })));
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
        fetchLookupOptions();
    }, [fetchProfiles, fetchLookupOptions]);

    const openEditor = (profile?: ProcessingProfile) => {
        if (profile) {
            setEditingProfile(profile);
            setFormName(profile.name || "");
            setFormDescription(profile.description || "");
            setFormFields(Array.isArray(profile.fields) ? profile.fields : []);
            setFormIsDefault(profile.is_default || false);
        } else {
            setEditingProfile(null);
            setFormName("");
            setFormDescription("");
            setFormFields([]);
            setFormIsDefault(false);
        }
        // Reset custom field inputs
        setNewFieldKey("");
        setNewFieldLabel("");
        setIsEditorOpen(true);
    };

    const updateFieldNormalization = (key: string, lookupSlug: string | null) => {
        setFormFields(formFields.map(f =>
            f.key === key
                ? { ...f, normalize_with: lookupSlug || undefined }
                : f
        ));
    };

    const toggleFieldTemplate = (key: string, useTemplate: boolean) => {
        setFormFields(formFields.map(f =>
            f.key === key
                ? { ...f, use_template: useTemplate, template: useTemplate ? (f.template || '') : undefined }
                : f
        ));
    };

    const updateFieldTemplate = (key: string, template: string) => {
        setFormFields(formFields.map(f =>
            f.key === key
                ? { ...f, template }
                : f
        ));
    };

    const addField = () => {
        if (!newFieldKey.trim() || !newFieldLabel.trim()) return;
        const key = newFieldKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
        if (formFields.some(f => f.key === key)) {
            alert("A field with this key already exists");
            return;
        }
        setFormFields([...formFields, { key, label: newFieldLabel.trim() }]);
        setNewFieldKey("");
        setNewFieldLabel("");
    };

    const removeField = (key: string) => {
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
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Profile Editor Dialog */}
            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
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
                                    Define which fields GPT should extract. Link to lookups for normalization.
                                </p>
                            </div>

                            {/* Fields list */}
                            {formFields.length > 0 ? (
                                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                                    {formFields.map((field) => (
                                        <div key={field.key} className="p-3 bg-background rounded-md border space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium truncate">{field.label}</span>
                                                    <span className="text-xs text-muted-foreground ml-1">({field.key})</span>
                                                </div>
                                                {!field.use_template && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground whitespace-nowrap">Normalize:</span>
                                                        <Select
                                                            value={field.normalize_with || "none"}
                                                            onValueChange={(v) => updateFieldNormalization(field.key, v === "none" ? null : v)}
                                                        >
                                                            <SelectTrigger className="w-28 h-8">
                                                                <SelectValue placeholder="None" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="none">None</SelectItem>
                                                                {lookupOptions.map((opt: LookupOption) => (
                                                                    <SelectItem key={opt.field_key} value={opt.field_key}>
                                                                        {opt.field_key}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-1.5">
                                                    <Checkbox
                                                        id={`template-${field.key}`}
                                                        checked={field.use_template || false}
                                                        onCheckedChange={(v) => toggleFieldTemplate(field.key, !!v)}
                                                    />
                                                    <Label htmlFor={`template-${field.key}`} className="text-xs cursor-pointer">Template</Label>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-500 hover:text-red-600 px-2"
                                                    onClick={() => removeField(field.key)}
                                                >
                                                    ✕
                                                </Button>
                                            </div>
                                            {field.use_template && (
                                                <Input
                                                    value={field.template || ''}
                                                    onChange={(e) => updateFieldTemplate(field.key, e.target.value)}
                                                    placeholder="e.g., {brand} - {name} ({color})"
                                                    className="text-sm"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="border rounded-lg p-6 text-center text-muted-foreground">
                                    No fields defined yet. Add fields below.
                                </div>
                            )}

                            {/* Add field */}
                            <div className="border-t pt-4 mt-4">
                                <Label className="text-sm font-medium mb-2 block">Add Field</Label>
                                <div className="flex items-end gap-3">
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Display Name</Label>
                                        <Input
                                            value={newFieldLabel}
                                            onChange={(e) => setNewFieldLabel(e.target.value)}
                                            placeholder="e.g., Product Name"
                                        />
                                    </div>
                                    <div className="w-40 space-y-1">
                                        <Label className="text-xs text-muted-foreground">Field Key</Label>
                                        <Input
                                            value={newFieldKey}
                                            onChange={(e) => setNewFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                            placeholder="product_name"
                                            className="font-mono"
                                        />
                                    </div>
                                    <Button
                                        onClick={addField}
                                        disabled={!newFieldKey.trim() || !newFieldLabel.trim()}
                                    >
                                        + Add
                                    </Button>
                                </div>
                            </div>
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
