"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LogOut, LayoutDashboard, Package, Settings, ChevronDown, FileInput, BookOpen } from "lucide-react";

const mainNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Orders", href: "/dashboard/orders", icon: Package },
];

const settingsSubItems = [
    { name: "Overview", href: "/dashboard/settings", icon: Settings },
    { name: "Profiles", href: "/dashboard/settings/processing", icon: FileInput },
    { name: "Catalogs", href: "/dashboard/settings/catalogs", icon: BookOpen },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    // Auto-expand settings if we're on a settings page
    useEffect(() => {
        if (pathname.startsWith("/dashboard/settings")) {
            setSettingsOpen(true);
        }
    }, [pathname]);

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            setUserEmail(user?.email || null);
        };
        fetchUser();
    }, []);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

    const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "?";
    const isSettingsActive = pathname.startsWith("/dashboard/settings");

    return (
        <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
            {/* Header */}
            <div className="flex h-20 items-center border-b border-sidebar-border px-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Ingestry</h1>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">Product Manager</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-0.5 px-3 py-4">
                <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">Menu</p>
                
                {/* Main nav items */}
                {mainNavigation.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 font-medium ring-2 ring-inset ring-slate-400/50"
                                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                            )}
                        >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}

                {/* Settings with dropdown */}
                <div>
                    <button
                        onClick={() => setSettingsOpen(!settingsOpen)}
                        className={cn(
                            "group flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                            isSettingsActive
                                ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 font-medium ring-2 ring-inset ring-slate-400/50"
                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                        )}
                    >
                        <div className="flex items-center gap-2.5">
                            <Settings className="h-4 w-4 shrink-0" />
                            <span>Settings</span>
                        </div>
                        <ChevronDown className={cn(
                            "h-4 w-4 shrink-0 transition-transform duration-200",
                            settingsOpen && "rotate-180"
                        )} />
                    </button>
                    
                    {/* Sub-items */}
                    {settingsOpen && (
                        <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
                            {settingsSubItems.map((item) => {
                                const isSubActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                                            isSubActive
                                                ? "bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 text-slate-700 dark:text-slate-300 font-medium ring-2 ring-inset ring-slate-400/50"
                                                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                                        )}
                                    >
                                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                                        <span>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>

            {/* Footer */}
            <div className="border-t border-sidebar-border px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                        {userInitial}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-muted-foreground truncate">
                            {userEmail || "Loading..."}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-red-500 transition-colors"
                        title="Log out"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
