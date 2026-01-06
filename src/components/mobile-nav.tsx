"use client";

/**
 * MobileNav - Mobile navigation drawer
 * Provides hamburger menu button and slide-in sidebar for mobile viewports.
 */

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetTitle,
} from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar";
import { useMobileNav } from "@/hooks/useMobileNav";

export function MobileNav({ className }: { className?: string }) {
    const { isOpen, setIsOpen, close } = useMobileNav();

    return (
        <div className={className}>
            {/* Mobile Header with Hamburger */}
            <div className="flex h-14 items-center justify-between border-b border-border/60 bg-background/95 backdrop-blur-sm px-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsOpen(true)}
                        className="h-9 w-9"
                        aria-label="Open navigation menu"
                    >
                        <Menu className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight">Ingestry</h1>
                    </div>
                </div>
            </div>

            {/* Slide-in Drawer */}
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetContent side="left" className="w-64 p-0">
                    <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                    <Sidebar onNavigate={close} />
                </SheetContent>
            </Sheet>
        </div>
    );
}
