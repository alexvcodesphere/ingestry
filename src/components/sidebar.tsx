"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: "📊" },
    { name: "Orders", href: "/dashboard/orders", icon: "📄" },
    { name: "Catalogues", href: "/dashboard/catalogues", icon: "📁" },
    { name: "Settings", href: "/dashboard/settings", icon: "⚙️" },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-64 flex-col border-r bg-background">
            {/* Header */}
            <div className="flex h-16 items-center border-b px-6">
                <h1 className="text-xl font-bold tracking-tight">Prodman</h1>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <span className="text-lg">{item.icon}</span>
                            <span>{item.name}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="border-t p-4">
                <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                        V
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Voo Store</p>
                        <p className="text-xs text-muted-foreground">Berlin</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
