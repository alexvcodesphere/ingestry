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
            <div className="flex h-20 items-center border-b border-sidebar-border px-6">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-sidebar-foreground">Ingestry</h1>
                    <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 mt-0.5">Product Manager</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-6">
                <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">Menu</p>
                {navigation.map((item) => {
                    const isActive = pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                        >
                            <span className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-lg text-base",
                                isActive
                                    ? "bg-white/20"
                                    : "bg-sidebar-accent"
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
                <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/40 px-4 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
                        V
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-sidebar-foreground truncate">Voo Store</p>
                        <p className="text-xs text-sidebar-foreground/40">Berlin, Germany</p>
                    </div>
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
            </div>
        </div>
    );
}
