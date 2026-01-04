"use client";

/**
 * Processing Profiles List Page
 * Links to full-page profile editor
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout";
import type { ProcessingProfile } from "@/types";
import { Trash2, FileText, Star, Plus, Sparkles, Loader2, Brain, Search, Wand2, CheckCircle2 } from "lucide-react";

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

export default function ProcessingProfilesPage() {
    const router = useRouter();
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSparkLoading, setIsSparkLoading] = useState(false);
    const sparkFileInputRef = useRef<HTMLInputElement>(null);

    const handleSparkSetup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsSparkLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/settings/profiles/suggest", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Failed to analyze document");
            }

            // Navigate to new profile with suggested fields
            const encodedFields = encodeURIComponent(JSON.stringify(result.fields));
            router.push(`/dashboard/settings/profiles/new?spark=${encodedFields}`);
        } catch (error) {
            console.error("Spark Setup error:", error);
            alert(error instanceof Error ? error.message : "Failed to analyze document");
        } finally {
            setIsSparkLoading(false);
            event.target.value = "";
        }
    };

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

    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Profiles"
                description="Configure extraction, transformation, and export pipelines"
                actions={
                    <div className="flex items-center gap-2">
                        <input
                            ref={sparkFileInputRef}
                            type="file"
                            accept=".pdf,image/*"
                            onChange={handleSparkSetup}
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            onClick={() => sparkFileInputRef.current?.click()}
                            disabled={isSparkLoading}
                            className="gap-1.5 group relative overflow-hidden"
                        >
                            <Sparkles className="h-4 w-4 text-purple-500 group-hover:animate-pulse" />
                            AI Setup
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                        </Button>
                        <Button onClick={() => router.push("/dashboard/settings/profiles/new")} className="gap-1.5">
                            <Plus className="h-4 w-4" />
                            New Profile
                        </Button>
                    </div>
                }
            />

            {/* Profiles Gallery */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {profiles.length === 0 ? (
                    <Card className="col-span-full">
                        <CardContent className="py-12 text-center text-muted-foreground">
                            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">No profiles yet</p>
                            <p className="text-sm mt-1">Create your first processing profile to get started</p>
                            <div className="flex items-center justify-center gap-3 mt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => sparkFileInputRef.current?.click()}
                                    disabled={isSparkLoading}
                                    className="gap-1.5"
                                >
                                    <Sparkles className="h-4 w-4 text-purple-500" />
                                    AI Setup
                                </Button>
                                <Button onClick={() => router.push("/dashboard/settings/profiles/new")}>
                                    Create Profile
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    profiles.map((profile) => {
                        const extracted = profile.fields?.filter(f => f.source !== 'computed').length || 0;
                        const computed = profile.fields?.filter(f => f.source === 'computed').length || 0;
                        const exportConfig = profile.export_configs?.[profile.default_export_config_idx ?? 0];
                        
                        return (
                            <div
                                key={profile.id}
                                onClick={() => router.push(`/dashboard/settings/profiles/${profile.id}`)}
                                className={`group relative p-4 rounded-2xl cursor-pointer transition-all hover:shadow-md active:scale-[0.98] ${
                                    profile.is_default 
                                        ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' 
                                        : 'bg-card/60 backdrop-blur-md ring-1 ring-inset ring-border/50 hover:ring-2 hover:ring-primary/30 hover:shadow-sm'
                                }`}
                            >
                                {/* Actions (top-right, hover only) */}
                                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!profile.is_default && (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSetDefault(profile.id);
                                                }}
                                                className="p-1.5 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10"
                                                title="Set as default"
                                            >
                                                <Star className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(profile.id);
                                                }}
                                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Header */}
                                <div className="flex items-center gap-2 mb-2 pr-16">
                                    {profile.is_default && (
                                        <Star className="h-4 w-4 text-primary shrink-0" />
                                    )}
                                    <h4 className="font-semibold truncate">{profile.name}</h4>
                                </div>
                                
                                {/* Description */}
                                <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mb-4">
                                    {profile.description || "No description"}
                                </p>
                                
                                {/* Stats Row */}
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-blue-600 dark:text-blue-400 font-medium">
                                        {extracted} source
                                    </span>
                                    {computed > 0 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-purple-600 dark:text-purple-400 font-medium">
                                            {computed} virtual
                                        </span>
                                    )}
                                    {exportConfig && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground">
                                            → {exportConfig.shop_system}
                                        </span>
                                    )}
                                </div>


                            </div>
                        );
                    })
                )}
            </div>

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
