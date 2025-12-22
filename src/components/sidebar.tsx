"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: "◉" },
    { name: "Orders", href: "/dashboard/orders", icon: "◫" },
    { name: "Settings", href: "/dashboard/settings", icon: "⚙" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
            {/* Header */}
            <div className="flex h-16 items-center border-b border-sidebar-border px-6">
                <div>
                    <h1 className="text-lg font-semibold tracking-tight text-sidebar-foreground">Ingestry</h1>
                    <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Product Manager</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                <p className="px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/40">Menu</p>
                {navigation.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-brand"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                        >
                            <span className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-md text-sm transition-colors",
                                isActive
                                    ? "bg-white/20"
                                    : "bg-sidebar-accent group-hover:bg-sidebar-primary/20"
                            )}>
                                {item.icon}
                            </span>
                            <span>{item.name}</span>

                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t border-sidebar-border p-4">
                <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/50 px-3 py-2.5 transition-colors hover:bg-sidebar-accent">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-brand text-xs font-bold text-white shadow-sm">
                        V
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-sidebar-foreground truncate">Voo Store</p>
                        <p className="text-xs text-sidebar-foreground/50">Berlin, Germany</p>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                </div>
            </div>
        </div>
    );
}

