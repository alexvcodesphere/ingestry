"use client";

/**
 * New Order Page
 * Simplified wizard: upload file → select profile → process
 * Shop system is derived from the selected profile's default export config
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { ShopSystem, ExportConfig } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

interface ProcessingProfile {
    id: string;
    name: string;
    is_default: boolean;
    export_configs?: ExportConfig[];
    default_export_config_idx?: number;
}

type WizardStep = "upload" | "configure" | "processing";

export default function NewOrderPage() {
    const router = useRouter();
    const [step, setStep] = useState<WizardStep>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [orderName, setOrderName] = useState("");
    const [_isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

    // Processing profile state
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>("");
    const [autoComputedFields, setAutoComputedFields] = useState(true);

    // Get selected profile
    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    const defaultExportConfig = selectedProfile?.export_configs?.[
        selectedProfile?.default_export_config_idx ?? 0
    ];

    // Fetch profiles on mount
    useEffect(() => {
        const fetchProfiles = async () => {
            const supabase = createClient();
            const { data } = await supabase
                .from("input_profiles")
                .select("id, name, is_default, export_configs, default_export_config_idx")
                .order("is_default", { ascending: false });

            if (data && data.length > 0) {
                setProfiles(data);
                // Select default profile
                const defaultProfile = data.find(p => p.is_default) || data[0];
                setSelectedProfileId(defaultProfile.id);
            }
        };
        fetchProfiles();
    }, []);

    // Move to configure step
    const handleContinueToConfig = () => {
        if (!file) {
            setError("Please select a file first");
            return;
        }
        setStep("configure");
    };

    // Handle file selection
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            // Validate file type
            const allowedTypes = ["application/pdf", "text/csv", "application/vnd.ms-excel"];
            if (!allowedTypes.includes(selectedFile.type) &&
                !selectedFile.name.endsWith(".csv") &&
                !selectedFile.name.endsWith(".pdf")) {
                setError("Please upload a PDF or CSV file");
                return;
            }
            setFile(selectedFile);
            setError(null);
        }
    };

    // Submit the order for processing
    const handleSubmit = async () => {
        if (!file) {
            setError("No file selected");
            return;
        }

        setStep("processing");
        setIsLoading(true);
        setError(null);
        setProgress("Uploading file...");

        try {
            const formData = new FormData();
            formData.append("file", file);
            // shop_system is now optional - derived from profile on server
            if (selectedProfileId) {
                formData.append("profile_id", selectedProfileId);
            }
            if (orderName.trim()) {
                formData.append("order_name", orderName.trim());
            }
            if (!autoComputedFields) {
                formData.append("skip_computed", "true");
            }

            setProgress("AI Processing...");

            const response = await fetch("/api/draft-orders", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Failed to process order");
            }

            setProgress(`✓ Order created with ${result.data.productCount} products`);
            setCreatedOrderId(result.data.orderId);
            setIsLoading(false);
            
            // Show success toast that persists even if user navigates away
            toast.success("Order created successfully", {
                description: `${result.data.productCount} products extracted`,
                action: {
                    label: "View Order",
                    onClick: () => router.push(`/dashboard/orders/${result.data.orderId}`),
                },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
            setStep("configure");
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Create New Order</h2>
                <p className="text-muted-foreground">
                    Upload an order confirmation to extract and process products
                </p>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center gap-2">
                {["upload", "configure", "processing"].map((s, i) => (
                    <div key={s} className="flex items-center">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === s
                                ? "bg-primary text-primary-foreground"
                                : ["upload", "configure", "processing"].indexOf(step) > i
                                    ? "bg-primary/20 text-primary"
                                    : "bg-muted text-muted-foreground"
                                }`}
                        >
                            {i + 1}
                        </div>
                        {i < 2 && (
                            <div
                                className={`w-12 h-0.5 ${["upload", "configure", "processing"].indexOf(step) > i
                                    ? "bg-primary"
                                    : "bg-muted"
                                    }`}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Error message */}
            {error && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Step 1: Upload */}
            {step === "upload" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Upload Order File</CardTitle>
                        <CardDescription>
                            Select a PDF or CSV file containing order confirmation data
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-6">
                        <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center">
                            <Input
                                type="file"
                                accept=".pdf,.csv"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                            />
                            <label
                                htmlFor="file-upload"
                                className="cursor-pointer flex flex-col items-center gap-2"
                            >
                                <div className="text-4xl">📄</div>
                                <p className="font-medium">
                                    {file ? file.name : "Click to select a file"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    PDF or CSV, max 10MB
                                </p>
                            </label>
                        </div>

                        {file && (
                            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">📄</span>
                                    <div>
                                        <p className="font-medium">{file.name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {(file.size / 1024).toFixed(1)} KB
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFile(null)}
                                >
                                    Remove
                                </Button>
                            </div>
                        )}

                        <Button
                            onClick={handleContinueToConfig}
                            disabled={!file}
                            className="w-full"
                        >
                            Continue
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Configure - Simplified without shop system selection */}
            {step === "configure" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Configure Processing</CardTitle>
                        <CardDescription>
                            Select processing profile and name your order
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pb-6">
                        {/* Order Name */}
                        <div className="space-y-2">
                            <Label htmlFor="orderName">Order Name (optional)</Label>
                            <Input
                                id="orderName"
                                value={orderName}
                                onChange={(e) => setOrderName(e.target.value)}
                                placeholder={file?.name.replace(/\.[^/.]+$/, "") || "e.g., Spring 2025 Order"}
                            />
                            <p className="text-xs text-muted-foreground">
                                Give this processing run a descriptive name for easy identification
                            </p>
                        </div>

                        {/* Processing Profile Selection */}
                        <div className="space-y-2">
                            <Label>Processing Profile</Label>
                            <Select
                                value={selectedProfileId}
                                onValueChange={setSelectedProfileId}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a profile" />
                                </SelectTrigger>
                                <SelectContent>
                                    {profiles.map((profile) => {
                                        const exportConfig = profile.export_configs?.[
                                            profile.default_export_config_idx ?? 0
                                        ];
                                        const targetLabel = exportConfig?.shop_system
                                            ? ` → ${exportConfig.shop_system.charAt(0).toUpperCase() + exportConfig.shop_system.slice(1)}`
                                            : "";
                                        return (
                                            <SelectItem key={profile.id} value={profile.id}>
                                                {profile.is_default && "⭐ "}{profile.name}{targetLabel}
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Determines extraction fields, transformations, and export target
                            </p>
                        </div>

                        {/* Show selected export target */}
                        {defaultExportConfig && (
                            <div className="p-3 bg-muted/50 rounded-lg">
                                <p className="text-sm">
                                    <span className="text-muted-foreground">Export Target:</span>{" "}
                                    <span className="font-medium capitalize">{defaultExportConfig.shop_system}</span>
                                    {defaultExportConfig.format && (
                                        <span className="text-muted-foreground"> ({defaultExportConfig.format.toUpperCase()})</span>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Auto-compute option */}
                        <div className="flex items-center gap-3 py-2">
                            <Checkbox
                                id="autoComputed"
                                checked={autoComputedFields}
                                onCheckedChange={(checked) => setAutoComputedFields(checked === true)}
                            />
                            <label htmlFor="autoComputed" className="text-sm cursor-pointer">
                                <span className="font-medium">Auto-generate computed fields</span>
                                <p className="text-xs text-muted-foreground">
                                    Run templates and AI enrichment during import
                                </p>
                            </label>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setStep("upload")}
                            >
                                Back
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                className="flex-1"
                            >
                                Process Order
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Processing */}
            {step === "processing" && (
                <Card>
                    <CardHeader>
                        <CardTitle>{createdOrderId ? "Order Created" : "Processing Order"}</CardTitle>
                        <CardDescription>
                            {createdOrderId 
                                ? "Your order has been processed successfully"
                                : "Extracting products using GPT Vision..."
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="py-12 pb-12">
                        <div className="flex flex-col items-center gap-4">
                            {createdOrderId ? (
                                <>
                                    <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                                        <span className="text-2xl">✓</span>
                                    </div>
                                    <p className="text-muted-foreground">{progress}</p>
                                    <Button onClick={() => router.push(`/dashboard/orders/${createdOrderId}`)}>
                                        View Order Details
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                                    <p className="text-muted-foreground">{progress}</p>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
