"use client";

/**
 * Settings Page
 * Configuration center with navigation to sub-pages.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const configSections = [
    {
        title: "Processing Profiles",
        description: "Configure extraction fields, normalization, and SKU generation",
        href: "/dashboard/settings/processing",
        icon: "⚙️",
    },
    {
        title: "Code Lookups",
        description: "Manage brand, category, and color code mappings",
        href: "/dashboard/settings/lookups",
        icon: "📋",
    },
];

const integrations = [
    { name: "Shopware 6", status: "env", statusLabel: "Configured via .env" },
    { name: "Xentral ERP", status: "env", statusLabel: "Configured via .env" },
    { name: "Shopify", status: "mock", statusLabel: "Mock Mode" },
    { name: "OpenAI API", status: "active", statusLabel: "Active" },
];

function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Check for saved preference or system preference
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
            className="relative h-10 w-20 rounded-full bg-muted p-1 transition-colors hover:bg-muted/80"
            aria-label="Toggle theme"
        >
            <div
                className={`absolute top-1 h-8 w-8 rounded-full bg-primary transition-all duration-300 flex items-center justify-center ${theme === "dark" ? "left-11" : "left-1"
                    }`}
            >
                <span className="text-primary-foreground text-sm">
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
        <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
            <div>
                <p className="font-medium">Normalization Tester</p>
                <p className="text-sm text-muted-foreground">
                    Show test panel on Code Lookups page
                </p>
            </div>
            <button
                onClick={toggle}
                className="relative h-10 w-20 rounded-full bg-muted p-1 transition-colors hover:bg-muted/80"
                aria-label="Toggle normalization tester"
            >
                <div
                    className={`absolute top-1 h-8 w-8 rounded-full transition-all duration-300 flex items-center justify-center ${enabled ? "left-11 bg-primary" : "left-1 bg-muted-foreground/30"
                        }`}
                >
                    <span className="text-primary-foreground text-sm">
                        {enabled ? "✓" : ""}
                    </span>
                </div>
            </button>
        </div>
    );
}

export default function SettingsPage() {
    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Configure processing profiles, lookups, and integrations
                </p>
            </div>

            {/* Configuration Sections */}
            <div className="grid gap-6 md:grid-cols-2">
                {configSections.map((section) => (
                    <Link key={section.href} href={section.href}>
                        <Card className="cursor-pointer h-full hover:border-primary/50 transition-colors">
                            <CardHeader>
                                <div className="flex items-center gap-3">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                                        {section.icon}
                                    </div>
                                    <div>
                                        <CardTitle>{section.title}</CardTitle>
                                        <CardDescription className="mt-1">{section.description}</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Button variant="outline" size="sm" className="w-full">
                                    Manage →
                                </Button>
                            </CardContent>
                        </Card>
                    </Link>
                ))}
            </div>

            {/* Appearance */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="text-xl">🎨</span>
                        Appearance
                    </CardTitle>
                    <CardDescription>
                        Customize the look and feel of the application
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-4 border rounded-xl bg-muted/30">
                        <div>
                            <p className="font-medium">Theme</p>
                            <p className="text-sm text-muted-foreground">
                                Switch between light and dark mode
                            </p>
                        </div>
                        <ThemeToggle />
                    </div>
                    <NormalizationTesterToggle />
                </CardContent>
            </Card>

            {/* Integrations */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <span className="text-xl">🔌</span>
                        Integrations
                    </CardTitle>
                    <CardDescription>
                        External service connections configured via environment variables
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {integrations.map((integration) => (
                            <div
                                key={integration.name}
                                className="flex items-center justify-between p-4 border rounded-xl bg-muted/30"
                            >
                                <span className="font-medium">{integration.name}</span>
                                <span
                                    className={`text-sm px-3 py-1.5 rounded-full font-medium ${integration.status === "active"
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
