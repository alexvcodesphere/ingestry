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
import type { ProcessingProfile } from "@/types";
import { Trash2, FileText, Sparkles, Plus, ExternalLink } from "lucide-react";

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
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-semibold">Profiles</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure extraction, transformation, and export pipelines
                    </p>
                </div>
                <Button onClick={() => router.push("/dashboard/settings/profiles/new")} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New Profile
                </Button>
            </div>

            {/* Profiles List */}
            <div className="grid gap-3">
                {profiles.length === 0 ? (
                    <Card>
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
                                className={`group p-4 rounded-lg border bg-card transition-all hover:ring-2 hover:ring-inset hover:ring-primary/20 ${
                                    profile.is_default 
                                        ? 'ring-2 ring-inset ring-primary/30 bg-primary/[0.02]' 
                                        : 'ring-1 ring-inset ring-border/50'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        {/* Header */}
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <h4 className="font-semibold text-base truncate">{profile.name}</h4>
                                            {profile.is_default && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide bg-primary/15 text-primary px-2 py-0.5 rounded shrink-0">
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Description */}
                                        {profile.description && (
                                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                                {profile.description}
                                            </p>
                                        )}
                                        
                                        {/* Stats Row */}
                                        <div className="flex flex-wrap items-center gap-3 text-xs">
                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                                {extracted} source
                                            </span>
                                            {computed > 0 && (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                                    <Sparkles className="h-3 w-3" />
                                                    {computed} virtual
                                                </span>
                                            )}
                                            {exportConfig && (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted text-muted-foreground">
                                                    → {exportConfig.shop_system}
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        ({exportConfig.field_mappings?.length || 0})
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {!profile.is_default && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleSetDefault(profile.id)}
                                                className="text-xs h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                Set Default
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => router.push(`/dashboard/settings/profiles/${profile.id}`)}
                                            className="gap-1.5 h-8"
                                        >
                                            Edit
                                            <ExternalLink className="h-3 w-3" />
                                        </Button>
                                        {!profile.is_default && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(profile.id)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
