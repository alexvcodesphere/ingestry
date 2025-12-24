"use client";

/**
 * Output Profiles Settings Page
 * Manage export field mappings and output configurations.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { OutputProfile, FieldMapping } from "@/lib/export";

const DEFAULT_MAPPING: FieldMapping = {
    source: "",
    target: "",
    template: "",
    default_value: "",
};

interface DBOutputProfile {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    field_mappings: FieldMapping[];
    format: "csv" | "json";
    format_options: {
        delimiter?: string;
        include_header?: boolean;
    };
    is_default: boolean;
    created_at: string;
}

interface InputProfileField {
    key: string;
    label: string;
}

interface DBInputProfile {
    id: string;
    name: string;
    fields: InputProfileField[];
}

export default function OutputProfilesPage() {
    const [profiles, setProfiles] = useState<DBOutputProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<DBOutputProfile | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        field_mappings: [] as FieldMapping[],
        format: "csv" as "csv" | "json",
        format_options: {
            delimiter: ";",
            include_header: true,
        },
    });
    const [isSaving, setIsSaving] = useState(false);
    const [inputProfiles, setInputProfiles] = useState<DBInputProfile[]>([]);

    const fetchProfiles = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("output_profiles")
            .select("*")
            .order("is_default", { ascending: false });

        if (!error && data) {
            setProfiles(data);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchProfiles();
        // Also fetch input profiles for import feature
        const fetchInputProfiles = async () => {
            const supabase = createClient();
            const { data } = await supabase
                .from("input_profiles")
                .select("id, name, fields")
                .order("name");
            if (data) setInputProfiles(data);
        };
        fetchInputProfiles();
    }, [fetchProfiles]);

    const handleOpenDialog = (profile?: DBOutputProfile) => {
        if (profile) {
            setEditingProfile(profile);
            setFormData({
                name: profile.name,
                description: profile.description || "",
                field_mappings: profile.field_mappings || [],
                format: profile.format,
                format_options: {
                    delimiter: profile.format_options?.delimiter || ";",
                    include_header: profile.format_options?.include_header !== false,
                },
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: "",
                description: "",
                field_mappings: [{ ...DEFAULT_MAPPING }],
                format: "csv",
                format_options: { delimiter: ";", include_header: true },
            });
        }
        setIsDialogOpen(true);
    };

    // Import fields from an input profile
    const handleImportFromInputProfile = (profileId: string) => {
        const inputProfile = inputProfiles.find(p => p.id === profileId);
        if (!inputProfile || !inputProfile.fields) return;

        // Create mappings from input profile fields
        const newMappings: FieldMapping[] = inputProfile.fields.map(field => ({
            source: field.key,
            target: field.key, // Default target = source (user can edit)
            template: "",
            default_value: "",
        }));

        setFormData(prev => ({
            ...prev,
            field_mappings: newMappings,
        }));
    };

    const handleAddMapping = () => {
        setFormData(prev => ({
            ...prev,
            field_mappings: [...prev.field_mappings, { ...DEFAULT_MAPPING }],
        }));
    };

    const handleRemoveMapping = (index: number) => {
        setFormData(prev => ({
            ...prev,
            field_mappings: prev.field_mappings.filter((_, i) => i !== index),
        }));
    };

    const handleMappingChange = (index: number, updates: Partial<FieldMapping>) => {
        setFormData(prev => ({
            ...prev,
            field_mappings: prev.field_mappings.map((m, i) => 
                i === index ? { ...m, ...updates } : m
            ),
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            const payload = {
                name: formData.name,
                description: formData.description || null,
                field_mappings: formData.field_mappings.filter(m => m.source && m.target),
                format: formData.format,
                format_options: formData.format_options,
            };

            if (editingProfile) {
                const { error } = await supabase
                    .from("output_profiles")
                    .update(payload)
                    .eq("id", editingProfile.id);
                if (error) throw error;
            } else {
                // Get tenant_id for new profile
                let tenantId = profiles[0]?.tenant_id;
                if (!tenantId) {
                    const { data: tenantData } = await supabase.rpc('get_user_tenant_id');
                    tenantId = tenantData;
                }
                
                const { error } = await supabase
                    .from("output_profiles")
                    .insert({ ...payload, tenant_id: tenantId });
                if (error) throw error;
            }
            setIsDialogOpen(false);
            await fetchProfiles();
        } catch (error) {
            console.error("Failed to save output profile:", error);
            alert("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetDefault = async (id: string) => {
        const supabase = createClient();
        await supabase.from("output_profiles").update({ is_default: false }).eq("is_default", true);
        await supabase.from("output_profiles").update({ is_default: true }).eq("id", id);
        await fetchProfiles();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this output profile?")) return;
        const supabase = createClient();
        await supabase.from("output_profiles").delete().eq("id", id);
        await fetchProfiles();
    };

    const handleDuplicate = (profile: DBOutputProfile) => {
        setEditingProfile(null);
        setFormData({
            name: `${profile.name} (Copy)`,
            description: profile.description || "",
            field_mappings: [...(profile.field_mappings || [])],
            format: profile.format,
            format_options: {
                delimiter: profile.format_options?.delimiter || ";",
                include_header: profile.format_options?.include_header !== false,
            },
        });
        setIsDialogOpen(true);
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
                    <h3 className="text-xl font-semibold">Output Profiles</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure how data is mapped and formatted for export to shop systems
                    </p>
                </div>
                <Button onClick={() => handleOpenDialog()}>Add Profile</Button>
            </div>

            {/* Profiles List */}
            <div className="space-y-3">
                {profiles.length === 0 && (
                    <Card>
                        <CardContent className="p-8 text-center text-muted-foreground">
                            No output profiles yet. Create one to start exporting data.
                        </CardContent>
                    </Card>
                )}
                {profiles.map((profile) => (
                    <Card key={profile.id}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h4 className="font-medium">{profile.name}</h4>
                                        <span className="text-xs bg-muted px-2 py-0.5 rounded uppercase">
                                            {profile.format}
                                        </span>
                                        {profile.is_default && (
                                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    {profile.description && (
                                        <p className="text-sm text-muted-foreground mb-2">
                                            {profile.description}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                        {profile.field_mappings?.slice(0, 5).map((mapping, i) => (
                                            <span
                                                key={i}
                                                className="text-xs bg-muted px-2 py-0.5 rounded font-mono"
                                            >
                                                {mapping.source} → {mapping.target}
                                            </span>
                                        ))}
                                        {(profile.field_mappings?.length || 0) > 5 && (
                                            <span className="text-xs text-muted-foreground">
                                                +{profile.field_mappings!.length - 5} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDuplicate(profile)}
                                        title="Duplicate"
                                    >
                                        Duplicate
                                    </Button>
                                    {!profile.is_default && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleSetDefault(profile.id)}
                                        >
                                            Set Default
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenDialog(profile)}
                                    >
                                        Edit
                                    </Button>
                                    {!profile.is_default && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(profile.id)}
                                            className="text-red-500"
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingProfile ? "Edit Output Profile" : "New Output Profile"}
                        </DialogTitle>
                        <DialogDescription>
                            Define how fields are mapped for export to external systems
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Basic Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Profile Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Xentral CSV"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Optional description"
                                />
                            </div>
                        </div>

                        {/* Format Options */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Format</Label>
                                <select
                                    value={formData.format}
                                    onChange={(e) => setFormData({ ...formData, format: e.target.value as "csv" | "json" })}
                                    className="w-full h-9 rounded-md border px-3 text-sm"
                                >
                                    <option value="csv">CSV</option>
                                    <option value="json">JSON</option>
                                </select>
                            </div>
                            {formData.format === "csv" && (
                                <>
                                    <div className="space-y-2">
                                        <Label>Delimiter</Label>
                                        <select
                                            value={formData.format_options.delimiter || ";"}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                format_options: { ...formData.format_options, delimiter: e.target.value }
                                            })}
                                            className="w-full h-9 rounded-md border px-3 text-sm"
                                        >
                                            <option value=";">Semicolon (;)</option>
                                            <option value=",">Comma (,)</option>
                                            <option value="\t">Tab</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Include Header</Label>
                                        <label className="flex items-center gap-2 h-9">
                                            <input
                                                type="checkbox"
                                                checked={formData.format_options.include_header !== false}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    format_options: { ...formData.format_options, include_header: e.target.checked }
                                                })}
                                                className="h-4 w-4"
                                            />
                                            <span className="text-sm">Yes</span>
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Field Mappings */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label>Field Mappings</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Map your data fields to the target system format
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {inputProfiles.length > 0 && (
                                        <select
                                            onChange={(e) => {
                                                if (e.target.value) handleImportFromInputProfile(e.target.value);
                                                e.target.value = "";
                                            }}
                                            className="h-8 rounded-md border px-2 text-xs bg-background"
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Import fields...</option>
                                            {inputProfiles.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                    )}
                                    <Button variant="outline" size="sm" onClick={handleAddMapping}>
                                        + Add
                                    </Button>
                                </div>
                            </div>

                            {/* Mappings table */}
                            <div className="border rounded-lg overflow-hidden">
                                {/* Header */}
                                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                                    <div className="col-span-3">Source</div>
                                    <div className="col-span-3">Target</div>
                                    <div className="col-span-3">Template</div>
                                    <div className="col-span-2">Default</div>
                                    <div className="col-span-1"></div>
                                </div>
                                
                                {/* Rows */}
                                <div className="max-h-56 overflow-y-auto divide-y">
                                    {formData.field_mappings.length === 0 && (
                                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                            No mappings yet. Add one or import from an Input Profile.
                                        </div>
                                    )}
                                    {formData.field_mappings.map((mapping, index) => (
                                        <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30">
                                            <Input
                                                placeholder="field_key"
                                                value={mapping.source}
                                                onChange={(e) => handleMappingChange(index, { source: e.target.value })}
                                                className="col-span-3 h-8 font-mono text-xs"
                                            />
                                            <Input
                                                placeholder="target_name"
                                                value={mapping.target}
                                                onChange={(e) => handleMappingChange(index, { target: e.target.value })}
                                                className="col-span-3 h-8 font-mono text-xs"
                                            />
                                            <Input
                                                placeholder="{field}"
                                                value={mapping.template || ""}
                                                onChange={(e) => handleMappingChange(index, { template: e.target.value })}
                                                className="col-span-3 h-8 font-mono text-xs"
                                            />
                                            <Input
                                                placeholder="fallback"
                                                value={mapping.default_value || ""}
                                                onChange={(e) => handleMappingChange(index, { default_value: e.target.value })}
                                                className="col-span-2 h-8 text-xs"
                                            />
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleRemoveMapping(index)}
                                                className="col-span-1 h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                                            >
                                                ×
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                <strong>Tip:</strong> Use templates like <code className="bg-muted px-1 rounded">{"{brand} - {name}"}</code> to combine fields.
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !formData.name || formData.field_mappings.length === 0}
                        >
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
