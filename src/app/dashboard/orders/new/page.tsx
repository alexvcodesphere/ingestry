"use client";

/**
 * New Order Page
 * Wizard flow for creating a new order: upload file → select shop system → select brand → process
 */

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShopSystem, Supplier } from "@/types";
import { createClient } from "@/lib/supabase/client";

type WizardStep = "upload" | "configure" | "processing";

const shopSystems: { value: ShopSystem; label: string; description: string }[] = [
    { value: "shopware", label: "Shopware", description: "Shopware 6 API" },
    { value: "xentral", label: "Xentral", description: "Xentral ERP System" },
    { value: "shopify", label: "Shopify", description: "Shopify Storefront (Mock)" },
];

export default function NewOrderPage() {
    const router = useRouter();
    const [step, setStep] = useState<WizardStep>("upload");
    const [file, setFile] = useState<File | null>(null);
    const [shopSystem, setShopSystem] = useState<ShopSystem>("shopware");
    const [brandId, setBrandId] = useState<string>("");
    const [brands, setBrands] = useState<Supplier[]>([]);
    const [brandSearch, setBrandSearch] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");

    // Fetch brands when entering configure step
    const fetchBrands = useCallback(async () => {
        const supabase = createClient();
        const { data } = await supabase
            .from("suppliers")
            .select("*")
            .order("brand_name");

        if (data) {
            setBrands(data);
        }
    }, []);

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

    // Move to configure step
    const handleContinueToConfig = () => {
        if (!file) {
            setError("Please select a file first");
            return;
        }
        fetchBrands();
        setStep("configure");
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
            formData.append("shop_system", shopSystem);
            if (brandId) {
                formData.append("brand_id", brandId);
            }

            setProgress("Processing with GPT Vision...");

            const response = await fetch("/api/draft-orders", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || "Failed to process order");
            }

            setProgress("Order created! Redirecting...");

            // Redirect to order detail page
            setTimeout(() => {
                router.push(`/dashboard/orders/${result.data.orderId}`);
            }, 1000);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
            setStep("configure");
            setIsLoading(false);
        }
    };

    // Filter brands based on search
    const filteredBrands = brands.filter(
        (b) =>
            b.brand_name.toLowerCase().includes(brandSearch.toLowerCase()) ||
            b.supplier_name.toLowerCase().includes(brandSearch.toLowerCase())
    );

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Create New Order</h2>
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
                    <CardContent className="space-y-4">
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

            {/* Step 2: Configure */}
            {step === "configure" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Configure Processing</CardTitle>
                        <CardDescription>
                            Select the target shop system and brand
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Shop System Selection */}
                        <div className="space-y-2">
                            <Label>Target Shop System</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {shopSystems.map((system) => (
                                    <button
                                        key={system.value}
                                        type="button"
                                        onClick={() => setShopSystem(system.value)}
                                        className={`p-4 rounded-lg border-2 text-left transition-colors ${shopSystem === system.value
                                                ? "border-primary bg-primary/5"
                                                : "border-muted hover:border-muted-foreground/50"
                                            }`}
                                    >
                                        <p className="font-medium">{system.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {system.description}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Brand Selection */}
                        <div className="space-y-2">
                            <Label>Brand / Supplier (Optional)</Label>
                            <Input
                                placeholder="Search brands..."
                                value={brandSearch}
                                onChange={(e) => setBrandSearch(e.target.value)}
                            />
                            <div className="max-h-48 overflow-auto border rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setBrandId("")}
                                    className={`w-full p-3 text-left hover:bg-muted border-b ${!brandId ? "bg-primary/5" : ""
                                        }`}
                                >
                                    <p className="font-medium text-muted-foreground">
                                        No specific brand
                                    </p>
                                </button>
                                {filteredBrands.map((brand) => (
                                    <button
                                        key={brand.id}
                                        type="button"
                                        onClick={() => setBrandId(brand.id)}
                                        className={`w-full p-3 text-left hover:bg-muted border-b ${brandId === brand.id ? "bg-primary/5" : ""
                                            }`}
                                    >
                                        <p className="font-medium">{brand.brand_name}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {brand.supplier_name}
                                        </p>
                                    </button>
                                ))}
                            </div>
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
                        <CardTitle>Processing Order</CardTitle>
                        <CardDescription>
                            Extracting products using GPT Vision...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="py-12">
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            <p className="text-muted-foreground">{progress}</p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
