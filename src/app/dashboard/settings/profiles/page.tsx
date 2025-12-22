"use client";

/**
 * Extraction Profiles Settings Page
 * Manage GPT extraction field configurations.
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
import type { ExtractionProfile, FieldDefinition } from "@/types";

const FIELD_TYPES = ["text", "number", "currency", "enum"];

const DEFAULT_FIELD: FieldDefinition = {
    key: "",
    label: "",
    type: "text",
    required: false,
    instructions: "",
};

export default function ExtractionProfilesPage() {
    const [profiles, setProfiles] = useState<ExtractionProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ExtractionProfile | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        fields: [] as FieldDefinition[],
        prompt_additions: "",
    });
    const [isSaving, setIsSaving] = useState(false);

    const fetchProfiles = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("extraction_profiles")
            .select("*")
            .order("is_default", { ascending: false });

        if (!error && data) {
            setProfiles(data);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    const handleOpenDialog = (profile?: ExtractionProfile) => {
        if (profile) {
            setEditingProfile(profile);
            setFormData({
                name: profile.name,
                description: profile.description || "",
                fields: profile.fields || [],
                prompt_additions: profile.prompt_additions || "",
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: "",
                description: "",
                fields: [{ ...DEFAULT_FIELD }],
                prompt_additions: "",
            });
        }
        setIsDialogOpen(true);
    };

    const handleAddField = () => {
        setFormData(prev => ({
            ...prev,
            fields: [...prev.fields, { ...DEFAULT_FIELD }],
        }));
    };

    const handleRemoveField = (index: number) => {
        setFormData(prev => ({
            ...prev,
            fields: prev.fields.filter((_, i) => i !== index),
        }));
    };

    const handleFieldChange = (index: number, field: Partial<FieldDefinition>) => {
        setFormData(prev => ({
            ...prev,
            fields: prev.fields.map((f, i) => i === index ? { ...f, ...field } : f),
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            if (editingProfile) {
                const { error } = await supabase
                    .from("extraction_profiles")
                    .update({
                        name: formData.name,
                        description: formData.description,
                        fields: formData.fields,
                        prompt_additions: formData.prompt_additions,
                    })
                    .eq("id", editingProfile.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("extraction_profiles")
                    .insert({
                        name: formData.name,
                        description: formData.description,
                        fields: formData.fields,
                        prompt_additions: formData.prompt_additions,
                    });
                if (error) throw error;
            }
            setIsDialogOpen(false);
            await fetchProfiles();
        } catch (error) {
            console.error("Failed to save profile:", error);
            alert("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetDefault = async (id: string) => {
        const supabase = createClient();
        await supabase.from("extraction_profiles").update({ is_default: false }).eq("is_default", true);
        await supabase.from("extraction_profiles").update({ is_default: true }).eq("id", id);
        await fetchProfiles();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this profile?")) return;
        const supabase = createClient();
        await supabase.from("extraction_profiles").delete().eq("id", id);
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
                    <h3 className="text-xl font-semibold">Extraction Profiles</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure which fields GPT Vision extracts from documents
                    </p>
                </div>
                <Button onClick={() => handleOpenDialog()}>Add Profile</Button>
            </div>

            {/* Profiles List */}
            <div className="space-y-3">
                {profiles.map((profile) => (
                    <Card key={profile.id}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <h4 className="font-medium">{profile.name}</h4>
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
                                        {profile.fields?.slice(0, 6).map((field) => (
                                            <span
                                                key={field.key}
                                                className="text-xs bg-muted px-2 py-0.5 rounded"
                                            >
                                                {field.label}
                                                {field.required && <span className="text-red-500">*</span>}
                                            </span>
                                        ))}
                                        {(profile.fields?.length || 0) > 6 && (
                                            <span className="text-xs text-muted-foreground">
                                                +{profile.fields!.length - 6} more
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
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
                            {editingProfile ? "Edit Profile" : "New Extraction Profile"}
                        </DialogTitle>
                        <DialogDescription>
                            Define which fields to extract from order documents
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Profile Name</Label>
                                <Input
                                    id="name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g., Fashion Order"
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

                        {/* Fields */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Extraction Fields</Label>
                                <Button variant="outline" size="sm" onClick={handleAddField}>
                                    Add Field
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-64 overflow-y-auto">
                                {formData.fields.map((field, index) => (
                                    <div key={index} className="flex items-center gap-2 p-2 border rounded-lg">
                                        <Input
                                            placeholder="key"
                                            value={field.key}
                                            onChange={(e) => handleFieldChange(index, { key: e.target.value })}
                                            className="w-24"
                                        />
                                        <Input
                                            placeholder="Label"
                                            value={field.label}
                                            onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                                            className="flex-1"
                                        />
                                        <select
                                            value={field.type}
                                            onChange={(e) => handleFieldChange(index, { type: e.target.value as FieldDefinition['type'] })}
                                            className="h-9 rounded-md border px-2 text-sm"
                                        >
                                            {FIELD_TYPES.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <label className="flex items-center gap-1 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={field.required}
                                                onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
                                            />
                                            Required
                                        </label>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveField(index)}
                                            className="text-red-500 px-2"
                                        >
                                            ×
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="prompt_additions">Additional Prompt Instructions</Label>
                            <textarea
                                id="prompt_additions"
                                value={formData.prompt_additions}
                                onChange={(e) => setFormData({ ...formData, prompt_additions: e.target.value })}
                                placeholder="Optional additional instructions for GPT..."
                                className="w-full h-20 rounded-md border px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !formData.name || formData.fields.length === 0}
                        >
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
