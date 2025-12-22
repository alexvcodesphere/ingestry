"use client";

/**
 * SKU Templates Settings Page
 * Manage SKU generation templates with live preview.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { SkuTemplate } from "@/types";

// Available template variables
const TEMPLATE_VARIABLES = [
    { var: "{season}", desc: "Season code (e.g., 123 for SS23)" },
    { var: "{brand}", desc: "Brand name" },
    { var: "{brand:2}", desc: "Brand code (2 chars)" },
    { var: "{gender}", desc: "Gender code (M/W/U)" },
    { var: "{category}", desc: "Category name" },
    { var: "{category:2}", desc: "Category code (2 digits)" },
    { var: "{color}", desc: "Color name" },
    { var: "{color:2}", desc: "Color code (2 digits)" },
    { var: "{size}", desc: "Size value" },
    { var: "{sequence}", desc: "Sequence number" },
    { var: "{sequence:3}", desc: "Sequence (3 digits)" },
    { var: "{ean}", desc: "EAN barcode" },
    { var: "{year}", desc: "2-digit year" },
];

export default function SkuTemplatesPage() {
    const [templates, setTemplates] = useState<SkuTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<SkuTemplate | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        template: "",
        description: "",
    });
    const [previewResult, setPreviewResult] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const fetchTemplates = useCallback(async () => {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("sku_templates")
            .select("*")
            .order("is_default", { ascending: false });

        if (!error && data) {
            setTemplates(data);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        fetchTemplates();
    }, [fetchTemplates]);

    // Generate preview from template
    useEffect(() => {
        if (formData.template) {
            const preview = formData.template
                .replace("{season}", "124")
                .replace("{brand:2}", "AC")
                .replace("{brand}", "Acne Studios")
                .replace("{gender}", "W")
                .replace("{category:2}", "01")
                .replace("{category}", "Outerwear")
                .replace("{color:2}", "01")
                .replace("{color}", "Black")
                .replace("{size}", "M")
                .replace("{sequence:3}", "001")
                .replace("{sequence}", "1")
                .replace("{ean}", "1234567890123")
                .replace("{year}", "24");
            setPreviewResult(preview);
        } else {
            setPreviewResult("");
        }
    }, [formData.template]);

    const handleOpenDialog = (template?: SkuTemplate) => {
        if (template) {
            setEditingTemplate(template);
            setFormData({
                name: template.name,
                template: template.template,
                description: template.description || "",
            });
        } else {
            setEditingTemplate(null);
            setFormData({ name: "", template: "", description: "" });
        }
        setIsDialogOpen(true);
    };

    const handleInsertVariable = (variable: string) => {
        setFormData(prev => ({
            ...prev,
            template: prev.template + variable
        }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const supabase = createClient();

        try {
            if (editingTemplate) {
                const { error } = await supabase
                    .from("sku_templates")
                    .update(formData)
                    .eq("id", editingTemplate.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("sku_templates")
                    .insert(formData);
                if (error) throw error;
            }
            setIsDialogOpen(false);
            await fetchTemplates();
        } catch (error) {
            console.error("Failed to save template:", error);
            alert("Failed to save template");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSetDefault = async (id: string) => {
        const supabase = createClient();

        // First, unset current default
        await supabase
            .from("sku_templates")
            .update({ is_default: false })
            .eq("is_default", true);

        // Then set new default
        await supabase
            .from("sku_templates")
            .update({ is_default: true })
            .eq("id", id);

        await fetchTemplates();
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this template?")) return;

        const supabase = createClient();
        await supabase.from("sku_templates").delete().eq("id", id);
        await fetchTemplates();
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
                    <h3 className="text-xl font-semibold">SKU Templates</h3>
                    <p className="text-sm text-muted-foreground">
                        Define how SKUs are generated using variable placeholders
                    </p>
                </div>
                <Button onClick={() => handleOpenDialog()}>Add Template</Button>
            </div>

            {/* Templates List */}
            <div className="space-y-3">
                {templates.map((template) => (
                    <Card key={template.id}>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-medium">{template.name}</h4>
                                        {template.is_default && (
                                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                    <code className="text-sm bg-muted px-2 py-1 rounded block mb-2">
                                        {template.template}
                                    </code>
                                    {template.description && (
                                        <p className="text-sm text-muted-foreground">
                                            {template.description}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {!template.is_default && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleSetDefault(template.id)}
                                        >
                                            Set Default
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenDialog(template)}
                                    >
                                        Edit
                                    </Button>
                                    {!template.is_default && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(template.id)}
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
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingTemplate ? "Edit Template" : "New SKU Template"}
                        </DialogTitle>
                        <DialogDescription>
                            Use variables like {"{brand:2}"} to insert dynamic values
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Template Name</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g., Fashion Standard"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="template">Template Pattern</Label>
                            <Input
                                id="template"
                                value={formData.template}
                                onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                                placeholder="e.g., {season}{brand:2}{gender}{category:2}..."
                                className="font-mono"
                            />
                            {previewResult && (
                                <p className="text-sm">
                                    Preview: <code className="bg-muted px-2 py-0.5 rounded">{previewResult}</code>
                                </p>
                            )}
                        </div>

                        {/* Variable buttons */}
                        <div className="space-y-2">
                            <Label>Insert Variable</Label>
                            <div className="flex flex-wrap gap-1">
                                {TEMPLATE_VARIABLES.map((v) => (
                                    <Button
                                        key={v.var}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleInsertVariable(v.var)}
                                        title={v.desc}
                                        className="text-xs"
                                    >
                                        {v.var}
                                    </Button>
                                ))}
                            </div>
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

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving || !formData.name || !formData.template}
                        >
                            {isSaving ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
