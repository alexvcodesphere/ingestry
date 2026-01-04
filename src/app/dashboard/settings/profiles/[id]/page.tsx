"use client";

/**
 * Full-Page Profile Editor
 * Split-screen layout: Steps (60%) | Live Preview (40%)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { ProcessingProfile, FieldDefinition, ExportConfig } from "@/types";
import { IntakeTab } from "@/components/settings/IntakeTab";
import { TransformTab } from "@/components/settings/TransformTab";
import { ExportTab } from "@/components/settings/ExportTab";
import { ProfilePreviewTable } from "@/components/settings/ProfilePreviewTable";
import { FileText, Sparkles, Send, ChevronRight, Save, Loader2, CircleDot, Copy, Pencil, Brain, Search, Wand2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const LOADING_ICONS = [Brain, Search, Wand2, CheckCircle2];

function CyclingIcon() {
    const [iconIndex, setIconIndex] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setIconIndex((prev) => (prev + 1) % LOADING_ICONS.length);
        }, 1200);
        return () => clearInterval(interval);
    }, []);
    const Icon = LOADING_ICONS[iconIndex];
    return (
        <div className="relative h-12 w-12 flex items-center justify-center">
            <Icon className="h-12 w-12 text-purple-500 absolute animate-in fade-in zoom-in duration-300" key={iconIndex} />
        </div>
    );
}

interface CatalogOption {
    field_key: string;
    custom_columns?: string[];
}

export default function ProfileEditorPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const profileId = params.id as string;
    const isNew = profileId === "new";

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [isSparkLoading, setIsSparkLoading] = useState(false);
    const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
    const [activeTab, setActiveTab] = useState("intake");
    const initialFormData = useRef<string>("");
    const sparkFileInputRef = useRef<HTMLInputElement>(null);

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
            // Check for spark query param (AI-suggested fields)
            const sparkData = searchParams.get("spark");
            let sparkFields: FieldDefinition[] = [];
            
            if (sparkData) {
                try {
                    sparkFields = JSON.parse(decodeURIComponent(sparkData));
                } catch (e) {
                    console.error("Failed to parse spark data:", e);
                }
            }
            
            const newData = {
                name: sparkFields.length > 0 ? "AI-Suggested Profile" : "New Profile",
                description: sparkFields.length > 0 ? "Fields suggested by Ingestry Spark" : "",
                fields: sparkFields.length > 0 
                    ? sparkFields 
                    : [{ key: "", label: "", type: "text" as const, required: false, source: "extracted" as const }],
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
    }, [profileId, isNew, router, searchParams]);

    const fetchCatalogOptions = useCallback(async () => {
        const supabase = createClient();
        
        // Fetch catalogs (entries) and their custom field definitions in parallel
        const [entriesRes, fieldsRes] = await Promise.all([
            supabase.from("catalog_entries").select("field_key").order("field_key"),
            supabase.from("catalog_fields").select("field_key, column_key")
        ]);

        if (entriesRes.data) {
            const uniqueKeys = [...new Set(entriesRes.data.map((d) => d.field_key))];
            
            // Group custom columns by catalog key
            const customColumnsMap = new Map<string, string[]>();
            if (fieldsRes.data) {
                for (const f of fieldsRes.data) {
                    const existing = customColumnsMap.get(f.field_key) || [];
                    existing.push(f.column_key);
                    customColumnsMap.set(f.field_key, existing);
                }
            }

            setCatalogOptions(uniqueKeys.map((fk) => ({ 
                field_key: fk,
                custom_columns: customColumnsMap.get(fk) || [] 
            })));
        }
    }, []);

    useEffect(() => {
        fetchProfile();
        fetchCatalogOptions();
    }, [fetchProfile, fetchCatalogOptions]);

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

    const handleSparkSetup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsSparkLoading(true);
        try {
            const formPayload = new FormData();
            formPayload.append("file", file);

            const response = await fetch("/api/settings/profiles/suggest", {
                method: "POST",
                body: formPayload,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Failed to analyze document");
            }

            // Update fields with suggested ones
            setFormData(prev => ({
                ...prev,
                fields: result.fields,
                name: prev.name === "New Profile" ? "AI-Suggested Profile" : prev.name,
                description: prev.description || "Fields suggested by Ingestry Spark",
            }));
            toast.success(`Suggested ${result.fields.length} fields from document`);
        } catch (error) {
            console.error("Spark Setup error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to analyze document");
        } finally {
            setIsSparkLoading(false);
            event.target.value = "";
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
                const { data, error } = await supabase
                    .from("input_profiles")
                    .insert(payload)
                    .select("id")
                    .single();
                if (error) throw error;
                // Update URL to the new profile ID without navigating away
                window.history.replaceState(null, "", `/dashboard/settings/profiles/${data.id}`);
            } else {
                const { error } = await supabase
                    .from("input_profiles")
                    .update(payload)
                    .eq("id", profileId);
                if (error) throw error;
            }
            // Update initial form data to reset dirty state
            initialFormData.current = JSON.stringify(formData);
            setIsDirty(false);
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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold tracking-tight">
                            {formData.name || "Untitled Profile"}
                        </h2>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                                const newName = prompt("Profile name:", formData.name);
                                if (newName !== null) {
                                    setFormData({ ...formData, name: newName });
                                }
                            }}
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {isDirty && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                                <CircleDot className="h-3 w-3" />
                                Unsaved
                            </span>
                        )}
                    </div>
                    <p className="text-muted-foreground">
                        {formData.description || "No description"} • {extractedCount} source fields • {computedCount} virtual fields
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleNavigateBack}>
                        Back
                    </Button>
                    {!isNew && (
                        <Button 
                            variant="outline" 
                            onClick={async () => {
                                setIsSaving(true);
                                const supabase = createClient();
                                try {
                                    const { data, error } = await supabase
                                        .from("input_profiles")
                                        .insert({
                                            name: `${formData.name} (Copy)`,
                                            description: formData.description || null,
                                            fields: formData.fields,
                                            prompt_additions: formData.prompt_additions || null,
                                            sku_template: formData.sku_template || null,
                                            generate_sku: formData.generate_sku,
                                            export_configs: formData.export_configs,
                                            default_export_config_idx: formData.default_export_config_idx,
                                        })
                                        .select("id")
                                        .single();
                                    if (error) throw error;
                                    router.push(`/dashboard/settings/profiles/${data.id}`);
                                } catch (error) {
                                    console.error("Failed to duplicate profile:", error);
                                    alert("Failed to create copy");
                                } finally {
                                    setIsSaving(false);
                                }
                            }} 
                            disabled={isSaving} 
                            className="gap-1.5"
                        >
                            <Copy className="h-4 w-4" />
                            Save as Copy
                        </Button>
                    )}
                    <Button onClick={handleSave} disabled={isSaving || !formData.name} className="gap-1.5">
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {isSaving ? "Saving..." : "Save Profile"}
                    </Button>
                </div>
            </div>

            {/* Split Layout Card */}
            <Card className="overflow-hidden min-h-[600px]">
                <div className="flex h-full">
                    {/* Left Pane - Editor (60%) */}
                    <div className="w-[60%] border-r p-6 space-y-6">
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
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setActiveTab('intake')}
                                className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.98] ${
                                    activeTab === 'intake'
                                        ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 text-blue-700 dark:text-blue-300 ring-2 ring-inset ring-blue-400/50 shadow-sm'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                            >
                                <FileText className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">Source Fields</div>
                                    <div className="text-xs opacity-70">What is AI looking for?</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'intake' ? 'bg-blue-200/50 dark:bg-blue-800/50' : 'bg-muted/60'}`}>
                                    {extractedCount}
                                </span>
                            </button>
                            <ChevronRight className="hidden md:block h-4 w-4 text-muted-foreground/40" />
                            <button
                                onClick={() => setActiveTab('transform')}
                                className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.98] ${
                                    activeTab === 'transform'
                                        ? 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 text-purple-700 dark:text-purple-300 ring-2 ring-inset ring-purple-400/50 shadow-sm'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                            >
                                <Sparkles className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">Virtual Fields</div>
                                    <div className="text-xs opacity-70">Computed & AI-enriched</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'transform' ? 'bg-purple-200/50 dark:bg-purple-800/50' : 'bg-muted/60'}`}>
                                    {computedCount}
                                </span>
                            </button>
                            <ChevronRight className="hidden md:block h-4 w-4 text-muted-foreground/40" />
                            <button
                                onClick={() => setActiveTab('export')}
                                className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer active:scale-[0.98] ${
                                    activeTab === 'export'
                                        ? 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 ring-2 ring-inset ring-slate-400/50 shadow-sm'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                            >
                                <Send className="h-4 w-4" />
                                <div className="text-left">
                                    <div className="font-medium text-sm">Export Mapping</div>
                                    <div className="text-xs opacity-70">Map to destinations</div>
                                </div>
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${activeTab === 'export' ? 'bg-slate-200/50 dark:bg-slate-700/50' : 'bg-muted/60'}`}>
                                    {mappedCount}
                                </span>
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="pt-2">
                            {activeTab === 'intake' && (
                                <>
                                    <input
                                        ref={sparkFileInputRef}
                                        type="file"
                                        accept=".pdf,image/*"
                                        onChange={handleSparkSetup}
                                        className="hidden"
                                    />
                                    <IntakeTab
                                        fields={formData.fields}
                                        onFieldsChange={handleFieldsChange}
                                        onSparkSetup={() => sparkFileInputRef.current?.click()}
                                    />
                                </>
                            )}

                            {activeTab === 'transform' && (
                                <TransformTab
                                    fields={formData.fields}
                                    catalogOptions={catalogOptions}
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
                                    className="w-full h-20 rounded-lg border border-border/60 ring-1 ring-inset ring-border/50 bg-muted/40 focus:bg-background px-3 py-2 text-sm resize-none"
                                />
                            </div>
                        </details>
                    </div>

                    {/* Right Pane - Preview (40%) */}
                    <div className="w-[40%] bg-gradient-to-br from-muted/20 to-muted/40 p-6">
                        <ProfilePreviewTable
                            fields={formData.fields}
                            exportConfig={formData.export_configs[formData.default_export_config_idx]}
                        />
                    </div>
                </div>
            </Card>

            {/* AI Setup Loading Overlay */}
            {isSparkLoading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card/90 shadow-xl ring-1 ring-border/50">
                        <CyclingIcon />
                        <div className="text-center">
                            <p className="font-medium text-lg">Analyzing document...</p>
                            <p className="text-sm text-muted-foreground mt-1">AI is identifying extractable fields</p>
                        </div>
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                </div>
            )}
        </div>
    );
}
