"use client";

/**
 * Processing Profiles List Page
 * Links to full-page profile editor
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout";
import type { ProcessingProfile } from "@/types";
import { Trash2, FileText, Star, Plus } from "lucide-react";

export default function ProcessingProfilesPage() {
    const router = useRouter();
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [isLoading, setIsLoading] = useState(true);

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
                    <Button onClick={() => router.push("/dashboard/settings/profiles/new")} className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        New Profile
                    </Button>
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
                            <Button
                                className="mt-4"
                                onClick={() => router.push("/dashboard/settings/profiles/new")}
                            >
                                Create Profile
                            </Button>
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
                                        ? 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 ring-2 ring-inset ring-purple-400/50 shadow-sm' 
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
                                        <Star className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
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
        </div>
    );
}
