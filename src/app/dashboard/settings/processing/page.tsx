"use client";

/**
 * Unified Profile Settings Page
 * Schema Master pattern: Fields flow through Intake → Transform → Export
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
import type { ProcessingProfile, FieldDefinition, ExportConfig } from "@/types";
import { IntakeTab } from "@/components/settings/IntakeTab";
import { TransformTab } from "@/components/settings/TransformTab";
import { ExportTab } from "@/components/settings/ExportTab";
import { Trash2, FileText, Sparkles, Send, ChevronRight } from "lucide-react";

interface LookupOption {
    field_key: string;
}

export default function UnifiedProfilesPage() {
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ProcessingProfile | null>(null);
    const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState("intake");

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        fields: [] as FieldDefinition[],
        prompt_additions: "",
        sku_template: "",
        generate_sku: false,
        export_configs: [] as ExportConfig[],
        default_export_config_idx: 0,
    });

    const fetchProfiles = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("input_profiles")
            .select("*")
            .order("is_default", { ascending: false });

        if (!error && data) {
            setProfiles(data.map(p => ({
                ...p,
                generate_sku: p.generate_sku ?? false,
                export_configs: p.export_configs ?? [],
                default_export_config_idx: p.default_export_config_idx ?? 0,
            })));
        }
        setIsLoading(false);
    }, []);

    const fetchLookupOptions = useCallback(async () => {
        const supabase = createClient();
        const { data } = await supabase
            .from("code_lookups")
            .select("field_key")
            .order("field_key");
        if (data) {
            const unique = [...new Set(data.map((d) => d.field_key))];
            setLookupOptions(unique.map((fk) => ({ field_key: fk })));
        }
    }, []);

    useEffect(() => {
        fetchProfiles();
        fetchLookupOptions();
    }, [fetchProfiles, fetchLookupOptions]);

    const openEditor = (profile?: ProcessingProfile) => {
        if (profile) {
            setEditingProfile(profile);
            // Ensure all fields have source set
            const fieldsWithSource = (profile.fields || []).map(f => ({
                ...f,
                source: f.source || 'extracted' as const,
            }));
            setFormData({
                name: profile.name,
                description: profile.description || "",
                fields: fieldsWithSource,
                prompt_additions: profile.prompt_additions || "",
                sku_template: profile.sku_template || "",
                generate_sku: profile.generate_sku ?? false,
                export_configs: profile.export_configs || [],
                default_export_config_idx: profile.default_export_config_idx ?? 0,
            });
        } else {
            setEditingProfile(null);
            setFormData({
                name: "",
                description: "",
                fields: [{ key: "", label: "", type: "text", required: false, source: "extracted" }],
                prompt_additions: "",
                sku_template: "",
                generate_sku: false,
                export_configs: [],
                default_export_config_idx: 0,
            });
        }
        setActiveTab("intake");
        setIsDialogOpen(true);
    };

    // Auto-create export mappings when fields are added
    const handleFieldsChange = (newFields: FieldDefinition[]) => {
        const currentKeys = new Set(formData.fields.map(f => f.key));
        const newKeys = newFields.filter(f => f.key && !currentKeys.has(f.key));

        if (newKeys.length > 0 && formData.export_configs.length > 0) {
            const updatedConfigs = formData.export_configs.map(config => ({
                ...config,
                field_mappings: [
                    ...config.field_mappings,
                    ...newKeys.map(f => ({ source: f.key, target: f.key })),
                ],
            }));
            setFormData({ ...formData, fields: newFields, export_configs: updatedConfigs });
        } else {
            setFormData({ ...formData, fields: newFields });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            const payload = {
                name: formData.name,
                description: formData.description || null,
                fields: formData.fields,
                prompt_additions: formData.prompt_additions || null,
                sku_template: formData.sku_template || null,
                generate_sku: formData.generate_sku,
                export_configs: formData.export_configs,
                default_export_config_idx: formData.default_export_config_idx,
            };

            if (editingProfile) {
                const { error } = await supabase
                    .from("input_profiles")
                    .update(payload)
                    .eq("id", editingProfile.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("input_profiles")
                    .insert(payload);
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

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this profile?")) return;
        const supabase = createClient();
        await supabase.from("input_profiles").delete().eq("id", id);
        await fetchProfiles();
    };

    const handleSetDefault = async (id: string) => {
        const supabase = createClient();
        await supabase.from("input_profiles").update({ is_default: false }).neq("id", id);
        await supabase.from("input_profiles").update({ is_default: true }).eq("id", id);
        await fetchProfiles();
    };

    // Count fields by type
    const extractedCount = formData.fields.filter(f => f.source !== 'computed').length;
    const computedCount = formData.fields.filter(f => f.source === 'computed').length;
    const mappedCount = formData.export_configs[0]?.field_mappings.length || 0;

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
                        Configure extraction, transformation, and export settings
                    </p>
                </div>
                <Button onClick={() => openEditor()}>Add Profile</Button>
            </div>

            {/* Profiles List */}
            <div className="space-y-3">
                {profiles.map((profile) => {
                    const extracted = profile.fields?.filter(f => f.source !== 'computed').length || 0;
                    const computed = profile.fields?.filter(f => f.source === 'computed').length || 0;
                    return (
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
                                            {profile.export_configs && profile.export_configs.length > 0 && (
                                                <span className="text-xs bg-muted px-2 py-0.5 rounded capitalize">
                                                    → {profile.export_configs[profile.default_export_config_idx ?? 0]?.shop_system || 'No export'}
                                                </span>
                                            )}
                                        </div>
                                        {profile.description && (
                                            <p className="text-sm text-muted-foreground mb-2">
                                                {profile.description}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <FileText className="h-3 w-3" />
                                                {extracted} extracted
                                            </span>
                                            {computed > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Sparkles className="h-3 w-3" />
                                                    {computed} computed
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
                                            onClick={() => openEditor(profile)}
                                        >
                                            Edit
                                        </Button>
                                        {!profile.is_default && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(profile.id)}
                                                className="text-destructive"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Editor Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {editingProfile ? "Edit Profile" : "New Profile"}
                        </DialogTitle>
                        <DialogDescription>
                            Define your data schema as it flows through the processing pipeline
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Header: Name inline with breadcrumb tabs */}
                        <div className="flex items-center gap-4 py-2">
                            {/* Name & Description - Compact */}
                            <div className="flex items-center gap-3 min-w-0">
                                <Input
                                    value={formData.name}
                                    onChange={(e) =>
                                        setFormData({ ...formData, name: e.target.value })
                                    }
                                    placeholder="Profile name"
                                    className="w-44 h-9 font-medium"
                                />
                                <Input
                                    value={formData.description}
                                    onChange={(e) =>
                                        setFormData({ ...formData, description: e.target.value })
                                    }
                                    placeholder="Description (optional)"
                                    className="w-48 h-9 text-sm"
                                />
                            </div>

                            {/* Divider */}
                            <div className="h-6 w-px bg-border" />

                            {/* Flow Breadcrumb Tabs - Left aligned */}
                            <div className="flex items-center gap-2 text-sm">
                                <button
                                    onClick={() => setActiveTab('intake')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
                                        activeTab === 'intake'
                                            ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 text-blue-700 dark:text-blue-300 ring-2 ring-inset ring-blue-400/50 dark:ring-blue-500/50 shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                    }`}
                                >
                                    <FileText className="h-4 w-4" />
                                    <span className="font-medium">Intake</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'intake' ? 'bg-blue-200/50 dark:bg-blue-800/50' : 'bg-muted'}`}>
                                        {extractedCount}
                                    </span>
                                </button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                <button
                                    onClick={() => setActiveTab('transform')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
                                        activeTab === 'transform'
                                            ? 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 text-purple-700 dark:text-purple-300 ring-2 ring-inset ring-purple-400/50 dark:ring-purple-500/50 shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                    }`}
                                >
                                    <Sparkles className="h-4 w-4" />
                                    <span className="font-medium">Transform</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'transform' ? 'bg-purple-200/50 dark:bg-purple-800/50' : 'bg-muted'}`}>
                                        {computedCount}
                                    </span>
                                </button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                <button
                                    onClick={() => setActiveTab('export')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all cursor-pointer ${
                                        activeTab === 'export'
                                            ? 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 ring-2 ring-inset ring-slate-400/50 dark:ring-slate-500/50 shadow-sm'
                                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                    }`}
                                >
                                    <Send className="h-4 w-4" />
                                    <span className="font-medium">Export</span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === 'export' ? 'bg-slate-200/50 dark:bg-slate-700/50' : 'bg-muted'}`}>
                                        {mappedCount}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="mt-4">
                            {activeTab === 'intake' && (
                                <IntakeTab
                                    fields={formData.fields}
                                    onFieldsChange={handleFieldsChange}
                                />
                            )}

                            {activeTab === 'transform' && (
                                <TransformTab
                                    fields={formData.fields}
                                    lookupOptions={lookupOptions}
                                    skuTemplate={formData.sku_template}
                                    generateSku={formData.generate_sku}
                                    onFieldsChange={(fields) => setFormData({ ...formData, fields })}
                                    onSkuTemplateChange={(template) =>
                                        setFormData({ ...formData, sku_template: template })
                                    }
                                    onGenerateSkuChange={(generate) =>
                                        setFormData({ ...formData, generate_sku: generate })
                                    }
                                />
                            )}

                            {activeTab === 'export' && (
                                <ExportTab
                                    exportConfigs={formData.export_configs}
                                    fields={formData.fields}
                                    defaultExportConfigIdx={formData.default_export_config_idx}
                                    onExportConfigsChange={(configs) =>
                                        setFormData({ ...formData, export_configs: configs })
                                    }
                                    onDefaultIdxChange={(idx) =>
                                        setFormData({ ...formData, default_export_config_idx: idx })
                                    }
                                />
                            )}
                        </div>

                        {/* Advanced: Prompt Additions */}
                        <div className="space-y-2">
                            <Label>Additional Prompt Instructions (Advanced)</Label>
                            <textarea
                                value={formData.prompt_additions}
                                onChange={(e) =>
                                    setFormData({ ...formData, prompt_additions: e.target.value })
                                }
                                placeholder="Optional additional instructions for AI extraction..."
                                className="w-full h-16 rounded-md border px-3 py-2 text-sm"
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
                            {isSaving ? "Saving..." : "Save Profile"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
