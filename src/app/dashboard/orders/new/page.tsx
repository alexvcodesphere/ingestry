"use client";

/**
 * New Order Page
 * Premium wizard with drag-and-drop file upload and Framer Motion animations
 * Steps: upload file → select profile → process
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
import type { ExportConfig } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, FileText, Check, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";

interface ProcessingProfile {
    id: string;
    name: string;
    is_default: boolean;
    export_configs?: ExportConfig[];
    default_export_config_idx?: number;
}

type WizardStep = "upload" | "configure" | "processing";

// Animation variants
const stepVariants = {
    enter: (direction: number) => ({
        x: direction > 0 ? 100 : -100,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction: number) => ({
        x: direction < 0 ? 100 : -100,
        opacity: 0,
    }),
};

const dropZoneVariants = {
    idle: {
        scale: 1,
        borderColor: "hsl(var(--border) / 0.5)",
    },
    hover: {
        scale: 1.01,
        borderColor: "hsl(var(--primary) / 0.7)",
        transition: { duration: 0.2 },
    },
    dragging: {
        scale: 1.02,
        borderColor: "hsl(var(--primary))",
        boxShadow: "0 0 30px -5px hsl(var(--primary) / 0.3)",
        transition: { duration: 0.2 },
    },
};

const fileCardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
        opacity: 1, 
        y: 0, 
        scale: 1,
        transition: { type: "spring" as const, stiffness: 300, damping: 25 }
    },
    exit: { 
        opacity: 0, 
        scale: 0.9, 
        transition: { duration: 0.15 } 
    },
};

const checkmarkVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
        pathLength: 1, 
        opacity: 1,
        transition: { 
            pathLength: { duration: 0.5, ease: "easeOut" as const },
            opacity: { duration: 0.1 }
        }
    },
};

const spinnerVariants = {
    animate: {
        rotate: 360,
        transition: {
            duration: 1,
            repeat: Infinity,
            ease: "linear" as const,
        },
    },
};

export default function NewOrderPage() {
    const router = useRouter();
    const [step, setStep] = useState<WizardStep>("upload");
    const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
    const [file, setFile] = useState<File | null>(null);
    const [orderName, setOrderName] = useState("");
    const [_isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<string>("");
    const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Processing profile state
    const [profiles, setProfiles] = useState<ProcessingProfile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>("");
    const [autoComputedFields, setAutoComputedFields] = useState(true);

    // Get selected profile
    const selectedProfile = profiles.find(p => p.id === selectedProfileId);
    const defaultExportConfig = selectedProfile?.export_configs?.[
        selectedProfile?.default_export_config_idx ?? 0
    ];

    // Step order for progress calculation
    const steps: WizardStep[] = ["upload", "configure", "processing"];
    const currentStepIndex = steps.indexOf(step);

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
                const defaultProfile = data.find(p => p.is_default) || data[0];
                setSelectedProfileId(defaultProfile.id);
            }
        };
        fetchProfiles();
    }, []);

    // Drag and drop handlers
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragOut = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            const allowedTypes = ["application/pdf", "text/csv", "application/vnd.ms-excel"];
            if (!allowedTypes.includes(droppedFile.type) &&
                !droppedFile.name.endsWith(".csv") &&
                !droppedFile.name.endsWith(".pdf")) {
                setError("Please upload a PDF or CSV file");
                return;
            }
            setFile(droppedFile);
            setError(null);
        }
    }, []);

    // Navigate to next step
    const goToStep = (newStep: WizardStep, dir: number = 1) => {
        setDirection(dir);
        setStep(newStep);
    };

    // Move to configure step
    const handleContinueToConfig = () => {
        if (!file) {
            setError("Please select a file first");
            return;
        }
        goToStep("configure", 1);
    };

    // Handle file selection via input
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
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

        goToStep("processing", 1);
        setIsLoading(true);
        setError(null);
        setProgress("Uploading file...");

        try {
            const formData = new FormData();
            formData.append("file", file);
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

            setProgress(`Order created with ${result.data.productCount} products`);
            setCreatedOrderId(result.data.orderId);
            setIsLoading(false);

            toast.success("Order created successfully", {
                description: `${result.data.productCount} products extracted`,
                action: {
                    label: "View Order",
                    onClick: () => router.push(`/dashboard/orders/${result.data.orderId}`),
                },
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
            goToStep("configure", -1);
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <h2 className="text-2xl font-bold tracking-tight">Create New Order</h2>
                <p className="text-muted-foreground">
                    Upload an order confirmation to extract and process products
                </p>
            </motion.div>

            {/* Animated Progress Stepper */}
            <div className="flex items-center gap-2">
                {steps.map((s, i) => (
                    <div key={s} className="flex items-center">
                        <motion.div
                            className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                                currentStepIndex >= i
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                            }`}
                            animate={{
                                scale: step === s ? 1.1 : 1,
                            }}
                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                            {currentStepIndex > i ? (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                    <Check className="h-4 w-4" />
                                </motion.div>
                            ) : (
                                <span>{i + 1}</span>
                            )}
                            {step === s && (
                                <motion.div
                                    className="absolute inset-0 rounded-full ring-2 ring-primary/30"
                                    layoutId="activeStepRing"
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                />
                            )}
                        </motion.div>
                        {i < 2 && (
                            <div className="w-8 sm:w-16 h-1 mx-1 bg-muted rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-primary rounded-full"
                                    initial={{ width: "0%" }}
                                    animate={{ 
                                        width: currentStepIndex > i ? "100%" : "0%" 
                                    }}
                                    transition={{ 
                                        type: "spring", 
                                        stiffness: 100, 
                                        damping: 20,
                                        delay: 0.1 
                                    }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Error message */}
            <AnimatePresence mode="wait">
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Step Content with Transitions */}
            <AnimatePresence mode="wait" custom={direction}>
                {/* Step 1: Upload */}
                {step === "upload" && (
                    <motion.div
                        key="upload"
                        custom={direction}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <Card className="bg-card/60 backdrop-blur-md ring-1 ring-inset ring-border/50 rounded-2xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Upload className="h-5 w-5 text-primary" />
                                    Upload Order File
                                </CardTitle>
                                <CardDescription>
                                    Drag and drop or click to select a PDF or CSV file
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pb-6">
                                {/* Drag and Drop Zone */}
                                <motion.div
                                    variants={dropZoneVariants}
                                    initial="idle"
                                    animate={isDragging ? "dragging" : "idle"}
                                    whileHover="hover"
                                    onDragEnter={handleDragIn}
                                    onDragLeave={handleDragOut}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    className="relative border-2 border-dashed border-border/50 bg-muted/30 rounded-xl p-10 text-center transition-colors cursor-pointer"
                                    style={{ borderColor: isDragging ? "hsl(var(--primary))" : undefined }}
                                >
                                    {/* Animated glow effect when dragging */}
                                    <AnimatePresence>
                                        {isDragging && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 bg-primary/5 rounded-xl"
                                            />
                                        )}
                                    </AnimatePresence>

                                    <Input
                                        type="file"
                                        accept=".pdf,.csv"
                                        onChange={handleFileChange}
                                        className="hidden"
                                        id="file-upload"
                                    />
                                    <label
                                        htmlFor="file-upload"
                                        className="cursor-pointer flex flex-col items-center gap-3 relative z-10"
                                    >
                                        <motion.div
                                            animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                                            transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                            className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center"
                                        >
                                            <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                                        </motion.div>
                                        <div>
                                            <p className="font-medium text-foreground">
                                                {isDragging ? "Drop your file here" : "Click to select or drag and drop"}
                                            </p>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                PDF or CSV, max 10MB
                                            </p>
                                        </div>
                                    </label>
                                </motion.div>

                                {/* Selected File Preview */}
                                <AnimatePresence mode="wait">
                                    {file && (
                                        <motion.div
                                            variants={fileCardVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            className="flex items-center justify-between p-4 bg-muted/50 rounded-xl ring-1 ring-inset ring-border/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <FileText className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {(file.size / 1024).toFixed(1)} KB
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setFile(null)}
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                Remove
                                            </Button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <Button
                                    onClick={handleContinueToConfig}
                                    disabled={!file}
                                    className="w-full group"
                                    size="lg"
                                >
                                    Continue
                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Step 2: Configure */}
                {step === "configure" && (
                    <motion.div
                        key="configure"
                        custom={direction}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <Card className="bg-card/60 backdrop-blur-md ring-1 ring-inset ring-border/50 rounded-2xl overflow-hidden">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                    Configure Processing
                                </CardTitle>
                                <CardDescription>
                                    Select processing profile and customize options
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
                                        className="bg-muted/40 border-border/40 focus:bg-background"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Give this processing run a descriptive name
                                    </p>
                                </div>

                                {/* Processing Profile Selection */}
                                <div className="space-y-2">
                                    <Label>Processing Profile</Label>
                                    <Select
                                        value={selectedProfileId}
                                        onValueChange={setSelectedProfileId}
                                    >
                                        <SelectTrigger className="w-full bg-muted/40 border-border/40">
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
                                <AnimatePresence mode="wait">
                                    {defaultExportConfig && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="p-3 bg-muted/30 rounded-lg ring-1 ring-inset ring-border/30"
                                        >
                                            <p className="text-sm">
                                                <span className="text-muted-foreground">Export Target:</span>{" "}
                                                <span className="font-medium capitalize">{defaultExportConfig.shop_system}</span>
                                                {defaultExportConfig.format && (
                                                    <span className="text-muted-foreground"> ({defaultExportConfig.format.toUpperCase()})</span>
                                                )}
                                            </p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

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
                                <div className="flex gap-3 pt-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => goToStep("upload", -1)}
                                        className="group"
                                    >
                                        <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                                        Back
                                    </Button>
                                    <Button
                                        onClick={handleSubmit}
                                        className="flex-1 group"
                                        size="lg"
                                    >
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Process Order
                                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Step 3: Processing */}
                {step === "processing" && (
                    <motion.div
                        key="processing"
                        custom={direction}
                        variants={stepVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                        <Card className="bg-card/60 backdrop-blur-md ring-1 ring-inset ring-border/50 rounded-2xl overflow-hidden">
                            <CardHeader>
                                <CardTitle>{createdOrderId ? "Order Created" : "Processing Order"}</CardTitle>
                                <CardDescription>
                                    {createdOrderId
                                        ? "Your order has been processed successfully"
                                        : "Extracting products using AI Vision..."}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="py-16">
                                <div className="flex flex-col items-center gap-6">
                                    {createdOrderId ? (
                                        <>
                                            {/* Animated checkmark */}
                                            <motion.div
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                                className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center ring-4 ring-green-200 dark:ring-green-800"
                                            >
                                                <motion.svg
                                                    className="h-10 w-10 text-green-600 dark:text-green-400"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="3"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <motion.path
                                                        d="M5 13l4 4L19 7"
                                                        variants={checkmarkVariants}
                                                        initial="hidden"
                                                        animate="visible"
                                                    />
                                                </motion.svg>
                                            </motion.div>
                                            <motion.p
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.3 }}
                                                className="text-muted-foreground font-medium"
                                            >
                                                {progress}
                                            </motion.p>
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.5 }}
                                            >
                                                <Button
                                                    onClick={() => router.push(`/dashboard/orders/${createdOrderId}`)}
                                                    size="lg"
                                                    className="group"
                                                >
                                                    View Order Details
                                                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                                                </Button>
                                            </motion.div>
                                        </>
                                    ) : (
                                        <>
                                            {/* Animated spinner */}
                                            <motion.div
                                                variants={spinnerVariants}
                                                animate="animate"
                                                className="h-16 w-16 rounded-full border-4 border-primary/20 border-t-primary"
                                            />
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="text-muted-foreground"
                                            >
                                                {progress}
                                            </motion.p>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
