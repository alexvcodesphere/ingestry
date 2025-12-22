"use client";

/**
 * Settings Page
 * Configuration center with navigation to sub-pages.
 */

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

export default function SettingsPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Configure templates, integrations, and system preferences
                </p>
            </div>

            {/* Configuration Sections */}
            <div className="grid gap-4 md:grid-cols-3">
                {configSections.map((section) => (
                    <Link key={section.href} href={section.href}>
                        <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <span className="text-2xl">{section.icon}</span>
                                    {section.title}
                                </CardTitle>
                                <CardDescription>{section.description}</CardDescription>
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

            {/* Integrations */}
            <Card>
                <CardHeader>
                    <CardTitle>Integrations</CardTitle>
                    <CardDescription>
                        External service connections configured via environment variables
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {integrations.map((integration) => (
                            <div
                                key={integration.name}
                                className="flex items-center justify-between p-3 border rounded-lg"
                            >
                                <span className="font-medium">{integration.name}</span>
                                <span
                                    className={`text-sm px-2 py-1 rounded ${integration.status === "active"
                                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                                        : integration.status === "mock"
                                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
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

            {/* Processing Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle>Processing Defaults</CardTitle>
                    <CardDescription>
                        Default settings applied during order processing
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <p className="font-medium">Auto-generate SKUs</p>
                                <p className="text-sm text-muted-foreground">
                                    Generate SKUs for products without one
                                </p>
                            </div>
                            <span className="text-sm text-muted-foreground">Enabled</span>
                        </div>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <p className="font-medium">Normalize Colors</p>
                                <p className="text-sm text-muted-foreground">
                                    Map color names to canonical values
                                </p>
                            </div>
                            <span className="text-sm text-muted-foreground">Enabled</span>
                        </div>
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                                <p className="font-medium">Mock Mode</p>
                                <p className="text-sm text-muted-foreground">
                                    Use mock adapters for external APIs
                                </p>
                            </div>
                            <span className="text-sm text-muted-foreground">
                                Per MOCK_EXTERNAL_APIS env
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
