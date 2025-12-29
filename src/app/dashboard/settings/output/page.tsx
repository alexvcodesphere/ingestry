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
import { Trash2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { TemplateInput, type FieldConfig as TemplateFieldConfig } from "@/components/ui/template-input";
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
    input_profile_id: string | null;
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
        input_profile_id: null as string | null,
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
                input_profile_id: profile.input_profile_id || null,
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: "",
                description: "",
                field_mappings: [{ ...DEFAULT_MAPPING }],
                format: "csv",
                format_options: { delimiter: ";", include_header: true },
                input_profile_id: null,
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
                input_profile_id: formData.input_profile_id,
            };

            if (editingProfile) {
                const { error } = await supabase
                    .from("output_profiles")
                    .update(payload)
                    .eq("id", editingProfile.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("output_profiles")
                    .insert(payload);
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
            input_profile_id: profile.input_profile_id || null,
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
                    <h2 className="text-2xl font-bold tracking-tight">Output Profiles</h2>
                    <p className="text-sm text-muted-foreground">Configure export field mappings and formats</p>
                </div>
                <Button onClick={() => handleOpenDialog()} size="sm">+ Add Profile</Button>
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
                                            size="icon"
                                            onClick={() => handleDelete(profile.id)}
                                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                        >
                                            <Trash2 className="h-4 w-4" />
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

                        {/* Input Profile Link */}
                        <div className="space-y-2">
                            <Label>Source Input Profile</Label>
                            <p className="text-xs text-muted-foreground">
                                Link to an input profile to enable field autocomplete
                            </p>
                            <Select
                                value={formData.input_profile_id || "none"}
                                onValueChange={(v) => setFormData({ ...formData, input_profile_id: v === "none" ? null : v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select input profile..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None (manual field entry)</SelectItem>
                                    {inputProfiles.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Format Options */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Format</Label>
                                <Select
                                    value={formData.format}
                                    onValueChange={(value) => setFormData({ ...formData, format: value as "csv" | "json" })}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="csv">CSV</SelectItem>
                                        <SelectItem value="json">JSON</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {formData.format === "csv" && (
                                <>
                                    <div className="space-y-2">
                                        <Label>Delimiter</Label>
                                        <Select
                                            value={formData.format_options.delimiter || ";"}
                                            onValueChange={(value) => setFormData({
                                                ...formData,
                                                format_options: { ...formData.format_options, delimiter: value }
                                            })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value=";">Semicolon (;)</SelectItem>
                                                <SelectItem value=",">Comma (,)</SelectItem>
                                                <SelectItem value="&#9;">Tab</SelectItem>
                                            </SelectContent>
                                        </Select>
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
                                        <Select
                                            onValueChange={(value) => {
                                                if (value) handleImportFromInputProfile(value);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 w-[140px] text-xs">
                                                <SelectValue placeholder="Import fields..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {inputProfiles.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
                                    {formData.field_mappings.map((mapping, index) => {
                                        // Get available fields from linked input profile
                                        const linkedProfile = inputProfiles.find(p => p.id === formData.input_profile_id);
                                        const availableFields = linkedProfile?.fields || [];
                                        const templateFields: TemplateFieldConfig[] = availableFields.map(f => ({
                                            key: f.key,
                                            label: f.label,
                                        }));

                                        return (
                                            <div key={index} className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30">
                                                {/* Source: Select if linked profile, otherwise free text */}
                                                {linkedProfile ? (
                                                    <div className="col-span-3">
                                                        <Select
                                                            value={mapping.source || "__custom__"}
                                                            onValueChange={(v) => {
                                                                if (v === "__custom__") {
                                                                    handleMappingChange(index, { source: "" });
                                                                } else {
                                                                    handleMappingChange(index, { source: v });
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-8 text-xs font-mono">
                                                                <SelectValue placeholder="Select field..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {availableFields.map(f => (
                                                                    <SelectItem key={f.key} value={f.key}>
                                                                        {f.key} <span className="text-muted-foreground">({f.label})</span>
                                                                    </SelectItem>
                                                                ))}
                                                                <SelectItem value="__custom__">Custom...</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        {mapping.source === "" && (
                                                            <Input
                                                                placeholder="custom_field"
                                                                value={mapping.source}
                                                                onChange={(e) => handleMappingChange(index, { source: e.target.value })}
                                                                className="h-8 font-mono text-xs mt-1"
                                                            />
                                                        )}
                                                    </div>
                                                ) : (
                                                    <Input
                                                        placeholder="field_key"
                                                        value={mapping.source}
                                                        onChange={(e) => handleMappingChange(index, { source: e.target.value })}
                                                        className="col-span-3 h-8 font-mono text-xs"
                                                    />
                                                )}
                                                <Input
                                                    placeholder="target_name"
                                                    value={mapping.target}
                                                    onChange={(e) => handleMappingChange(index, { target: e.target.value })}
                                                    className="col-span-3 h-8 font-mono text-xs"
                                                />
                                                <div className="col-span-3">
                                                    <TemplateInput
                                                        value={mapping.template || ""}
                                                        onChange={(v) => handleMappingChange(index, { template: v })}
                                                        fields={templateFields}
                                                        placeholder="{field}"
                                                    />
                                                </div>
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
                                        );
                                    })}
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
