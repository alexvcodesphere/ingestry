"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { LogOut, LayoutDashboard, Package, Settings, FileInput, BookOpen } from "lucide-react";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Orders", href: "/dashboard/orders", icon: Package },
    { name: "Profiles", href: "/dashboard/settings/processing", icon: FileInput },
    { name: "Catalogs", href: "/dashboard/settings/catalogs", icon: BookOpen },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
    const pathname = usePathname();
    const router = useRouter();
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

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
                
                {navigation.map((item) => {
                    // Settings should only be active on exact match
                    const isActive = item.href === "/dashboard/settings"
                        ? pathname === item.href
                        : pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            onClick={onNavigate}
                            className={cn(
                                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-primary/10 text-primary font-medium ring-2 ring-inset ring-primary/30"
                                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                            )}
                        >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
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
