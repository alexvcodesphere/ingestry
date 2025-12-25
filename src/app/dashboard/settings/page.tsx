"use client";

/**
 * Settings Page
 * Configuration center with navigation to sub-pages.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, FileInput, FileOutput, BookOpen } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const configSections = [
    {
        title: "Input Profiles",
        description: "Extraction fields and normalization",
        href: "/dashboard/settings/processing",
        icon: FileInput,
    },
    {
        title: "Output Profiles",
        description: "Field mappings for export",
        href: "/dashboard/settings/output",
        icon: FileOutput,
    },
    {
        title: "Code Lookups",
        description: "Brand, category, and color codes",
        href: "/dashboard/settings/lookups",
        icon: BookOpen,
    },
];

const integrations = [
    { name: "Shopware 6", status: "env", statusLabel: "Configured via .env" },
    { name: "Xentral ERP", status: "env", statusLabel: "Configured via .env" },
    { name: "Shopify", status: "mock", statusLabel: "Mock Mode" },
    { name: "OpenAI API", status: "active", statusLabel: "Active" },
    { name: "Gemini API", status: "active", statusLabel: "Active" },
];

function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        const initialTheme = savedTheme || systemTheme;
        setTheme(initialTheme);
        document.documentElement.classList.toggle("dark", initialTheme === "dark");
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        document.documentElement.classList.toggle("dark", newTheme === "dark");
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleTheme}
            className="relative h-6 w-11 rounded-full bg-muted p-0.5 transition-colors hover:bg-muted/80"
            aria-label="Toggle theme"
        >
            <div
                className={`h-5 w-5 rounded-full bg-primary transition-all duration-200 flex items-center justify-center ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`}
            >
                <span className="text-primary-foreground text-[10px]">
                    {theme === "dark" ? "🌙" : "☀️"}
                </span>
            </div>
        </button>
    );
}

function NormalizationTesterToggle() {
    const [enabled, setEnabled] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem("showNormalizationTester");
        setEnabled(saved === "true");
    }, []);

    const toggle = () => {
        const newValue = !enabled;
        setEnabled(newValue);
        localStorage.setItem("showNormalizationTester", String(newValue));
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggle}
            className="relative h-6 w-11 rounded-full bg-muted p-0.5 transition-colors hover:bg-muted/80"
            aria-label="Toggle normalization tester"
        >
            <div
                className={`h-5 w-5 rounded-full transition-all duration-200 flex items-center justify-center ${enabled ? "translate-x-5 bg-primary" : "translate-x-0 bg-muted-foreground/40"}`}
            />
        </button>
    );
}

function VisionModelSelector() {
    const [model, setModel] = useState<string>("gpt-4o");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const models = [
        { value: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
        { value: "gemini-3-flash", label: "Gemini 3 Flash", provider: "Google" },
        { value: "gemini-3-pro", label: "Gemini 3 Pro", provider: "Google" },
    ];

    useEffect(() => {
        fetch("/api/settings/vision-model")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setModel(data.data.vision_model);
                }
            })
            .finally(() => setLoading(false));
    }, []);

    const handleChange = async (newModel: string) => {
        setSaving(true);
        try {
            const res = await fetch("/api/settings/vision-model", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vision_model: newModel }),
            });
            const data = await res.json();
            if (data.success) {
                setModel(newModel);
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <span className="text-sm text-muted-foreground">Loading...</span>;
    }

    return (
        <Select
            value={model}
            onValueChange={handleChange}
            disabled={saving}
        >
            <SelectTrigger className="h-8 w-48">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {models.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                        {m.label} ({m.provider})
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function AIReasoningToggle() {
    const [enabled, setEnabled] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetch("/api/settings/vision-model")
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setEnabled(data.data.ai_reasoning_enabled ?? false);
                }
            });
    }, []);

    const toggle = async () => {
        const newValue = !enabled;
        setSaving(true);
        try {
            const res = await fetch("/api/settings/vision-model", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ai_reasoning_enabled: newValue }),
            });
            const data = await res.json();
            if (data.success) {
                setEnabled(newValue);
            }
        } finally {
            setSaving(false);
        }
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggle}
            disabled={saving}
            className="relative h-6 w-11 rounded-full bg-muted p-0.5 transition-colors hover:bg-muted/80 disabled:opacity-50"
            aria-label="Toggle AI reasoning flags"
        >
            <div
                className={`h-5 w-5 rounded-full transition-all duration-200 flex items-center justify-center ${enabled ? "translate-x-5 bg-primary" : "translate-x-0 bg-muted-foreground/40"}`}
            />
        </button>
    );
}

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-sm text-muted-foreground">
                    Configure profiles, lookups, and integrations
                </p>
            </div>

            {/* Navigation Cards */}
            <div className="grid gap-3 md:grid-cols-3">
                {configSections.map((section) => (
                    <Link key={section.href} href={section.href}>
                        <Card className="group cursor-pointer h-full hover:border-primary/50 hover:bg-muted/30 transition-all">
                            <CardContent className="flex items-center justify-between p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                        <section.icon className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{section.title}</p>
                                        <p className="text-xs text-muted-foreground">{section.description}</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Preferences */}
            <Card>
                <CardHeader className="border-b">
                    <CardTitle className="text-base font-medium">Preferences</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y">
                        <div className="flex items-center justify-between px-6 py-4">
                            <div>
                                <p className="text-sm font-medium">Theme</p>
                                <p className="text-xs text-muted-foreground">Light or dark mode</p>
                            </div>
                            <ThemeToggle />
                        </div>
                        <div className="flex items-center justify-between px-6 py-4">
                            <div>
                                <p className="text-sm font-medium">Normalization Tester</p>
                                <p className="text-xs text-muted-foreground">Show test panel on Lookups page</p>
                            </div>
                            <NormalizationTesterToggle />
                        </div>
                        <div className="flex items-center justify-between px-6 py-4">
                            <div>
                                <p className="text-sm font-medium">AI Vision Model</p>
                                <p className="text-xs text-muted-foreground">Model used for PDF extraction</p>
                            </div>
                            <VisionModelSelector />
                        </div>
                        <div className="flex items-center justify-between px-6 py-4">
                            <div>
                                <p className="text-sm font-medium">AI Reasoning Flags</p>
                                <p className="text-xs text-muted-foreground">Show uncertainty indicators (uses more tokens)</p>
                            </div>
                            <AIReasoningToggle />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Integrations */}
            <Card>
                <CardHeader className="border-b">
                    <CardTitle className="text-base font-medium">Integrations</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y">
                        {integrations.map((integration) => (
                            <div
                                key={integration.name}
                                className="flex items-center justify-between px-6 py-4"
                            >
                                <span className="text-sm font-medium">{integration.name}</span>
                                <span
                                    className={`text-xs px-2 py-1 rounded-full font-medium ${integration.status === "active"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                        : integration.status === "mock"
                                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                >
                                    {integration.statusLabel}
                                </span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
