"use client";

/**
 * Full-Page Profile Editor
 * Split-screen layout: Steps (60%) | Live Preview (40%)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { ProcessingProfile, FieldDefinition, ExportConfig } from "@/types";
import { IntakeTab } from "@/components/settings/IntakeTab";
import { TransformTab } from "@/components/settings/TransformTab";
import { ExportTab } from "@/components/settings/ExportTab";
import { ProfilePreviewTable } from "@/components/settings/ProfilePreviewTable";
import { ArrowLeft, FileText, Sparkles, Send, ChevronRight, Save, Loader2, CircleDot } from "lucide-react";

interface LookupOption {
    field_key: string;
}

export default function ProfileEditorPage() {
    const params = useParams();
    const router = useRouter();
    const profileId = params.id as string;
    const isNew = profileId === "new";

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [lookupOptions, setLookupOptions] = useState<LookupOption[]>([]);
    const [activeTab, setActiveTab] = useState("intake");
    const initialFormData = useRef<string>("");

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

    // Track dirty state
    useEffect(() => {
        if (!isLoading && initialFormData.current) {
            setIsDirty(JSON.stringify(formData) !== initialFormData.current);
        }
    }, [formData, isLoading]);

    // Unsaved changes warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isDirty]);

    const handleNavigateBack = () => {
        if (isDirty && !confirm("You have unsaved changes. Are you sure you want to leave?")) {
            return;
        }
        router.push("/dashboard/settings/processing");
    };

    const fetchProfile = useCallback(async () => {
        if (isNew) {
            const newData = {
                name: "New Profile",
                description: "",
                fields: [{ key: "", label: "", type: "text" as const, required: false, source: "extracted" as const }],
                prompt_additions: "",
                sku_template: "",
                generate_sku: false,
                export_configs: [],
                default_export_config_idx: 0,
            };
            setFormData(newData);
            initialFormData.current = JSON.stringify(newData);
            setIsLoading(false);
            return;
        }

        const supabase = createClient();
        const { data, error } = await supabase
            .from("input_profiles")
            .select("*")
            .eq("id", profileId)
            .single();

        if (error || !data) {
            router.push("/dashboard/settings/processing");
            return;
        }

        const fieldsWithSource = (data.fields || []).map((f: FieldDefinition) => ({
            ...f,
            source: f.source || 'extracted' as const,
        }));

        const loadedData = {
            name: data.name,
            description: data.description || "",
            fields: fieldsWithSource,
            prompt_additions: data.prompt_additions || "",
            sku_template: data.sku_template || "",
            generate_sku: data.generate_sku ?? false,
            export_configs: data.export_configs || [],
            default_export_config_idx: data.default_export_config_idx ?? 0,
        };
        setFormData(loadedData);
        initialFormData.current = JSON.stringify(loadedData);
        setIsLoading(false);
    }, [profileId, isNew, router]);

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
        fetchProfile();
        fetchLookupOptions();
    }, [fetchProfile, fetchLookupOptions]);

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

            if (isNew) {
                const { error } = await supabase
                    .from("input_profiles")
                    .insert(payload);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("input_profiles")
                    .update(payload)
                    .eq("id", profileId);
                if (error) throw error;
            }
            setIsDirty(false);
            router.push("/dashboard/settings/processing");
        } catch (error) {
            console.error("Failed to save profile:", error);
            alert("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    // Field counts
    const extractedCount = formData.fields.filter(f => f.source !== 'computed').length;
    const computedCount = formData.fields.filter(f => f.source === 'computed').length;
    const mappedCount = formData.export_configs[formData.default_export_config_idx]?.field_mappings.length || 0;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header - Minimal, no background */}
            <header className="px-6 py-4 flex items-center justify-between border-b border-border/60">
                <div className="flex items-center gap-4">
                    <button
                        onClick={handleNavigateBack}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Profiles
                    </button>
                    <div className="h-6 w-px bg-border/50" />
                    <div className="flex items-center gap-3">
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-64 h-10 font-semibold text-lg border-none shadow-none focus-visible:ring-0 bg-transparent"
                            placeholder="Profile name"
                        />
                        {isDirty && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-xs text-amber-600 dark:text-amber-400">
                                <CircleDot className="h-3 w-3" />
                                Unsaved
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleNavigateBack}
                        className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                    >
                        Cancel
                    </button>
                    <Button onClick={handleSave} disabled={isSaving || !formData.name} className="gap-1.5 min-w-[120px]">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? "Saving..." : "Save Profile"}
                    </Button>
                </div>
            </header>

            {/* Split Layout */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Pane - Steps (60%) */}
                <div className="w-[60%] border-r overflow-y-auto">
                    <div className="p-6 space-y-6">
                        {/* Description */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Description</Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="What is this profile for?"
                                className="h-9"
                            />
                        </div>

                        {/* Step Tabs */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setActiveTab('intake')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                                    activeTab === 'intake'
                                        ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 text-blue-700 dark:text-blue-300 ring-2 ring-inset ring-blue-400/50 shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                            >
                                <FileText className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">PDF Extraction</div>
                                    <div className="text-xs opacity-70">What is AI looking for?</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'intake' ? 'bg-blue-200/50 dark:bg-blue-800/50' : 'bg-muted'}`}>
                                    {extractedCount}
                                </span>
                            </button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                            <button
                                onClick={() => setActiveTab('transform')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                                    activeTab === 'transform'
                                        ? 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 text-purple-700 dark:text-purple-300 ring-2 ring-inset ring-purple-400/50 shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                            >
                                <Sparkles className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">Logic & Enrichment</div>
                                    <div className="text-xs opacity-70">Add virtual fields & AI</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'transform' ? 'bg-purple-200/50 dark:bg-purple-800/50' : 'bg-muted'}`}>
                                    {computedCount}
                                </span>
                            </button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                            <button
                                onClick={() => setActiveTab('export')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
                                    activeTab === 'export'
                                        ? 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 ring-2 ring-inset ring-slate-400/50 shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                }`}
                            >
                                <Send className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">Destination Mapping</div>
                                    <div className="text-xs opacity-70">Map to target columns</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'export' ? 'bg-slate-200/50 dark:bg-slate-700/50' : 'bg-muted'}`}>
                                    {mappedCount}
                                </span>
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="pt-2">
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

                        {/* Advanced Settings */}
                        <details className="text-sm">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
                                Advanced Settings
                            </summary>
                            <div className="mt-3 space-y-2">
                                <Label className="text-xs">Additional Prompt Instructions</Label>
                                <textarea
                                    value={formData.prompt_additions}
                                    onChange={(e) =>
                                        setFormData({ ...formData, prompt_additions: e.target.value })
                                    }
                                    placeholder="Optional instructions for AI extraction..."
                                    className="w-full h-20 rounded-xl border px-3 py-2 text-sm resize-none"
                                />
                            </div>
                        </details>
                    </div>
                </div>

                {/* Right Pane - Preview (40%) */}
                <div className="w-[40%] bg-gradient-to-br from-muted/20 to-muted/40 p-6 sticky top-0">
                    <ProfilePreviewTable
                        fields={formData.fields}
                        exportConfig={formData.export_configs[formData.default_export_config_idx]}
                    />
                </div>
            </div>
        </div>
    );
}
