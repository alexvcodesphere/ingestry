"use client";

/**
 * Floating Action Bar Component
 * Appears at the bottom of the screen when items are selected.
 * Provides quick actions for bulk operations.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { X, Check, RefreshCw, Undo2, ChevronDown } from "lucide-react";
import { useState } from "react";

export interface QuickSetField {
    key: string;
    label: string;
    type: "text" | "select";
    options?: { value: string; label: string }[];
}

export interface ComputedField {
    key: string;
    label: string;
}

interface FloatingActionBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onApprove?: () => void;
    onUnapprove?: () => void;
    onRecalculate?: (fieldKeys?: string[]) => void;
    onQuickSet?: (field: string, value: string) => void;
    quickSetFields?: QuickSetField[];
    computedFields?: ComputedField[];
    isLoading?: boolean;
}

export function FloatingActionBar({
    selectedCount,
    onClearSelection,
    onApprove,
    onUnapprove,
    onRecalculate,
    onQuickSet,
    quickSetFields = [],
    computedFields = [],
    isLoading = false,
}: FloatingActionBarProps) {
    const [activeField, setActiveField] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState("");

    if (selectedCount === 0) return null;

    const handleQuickSet = (field: string, value: string) => {
        if (onQuickSet && value) {
            onQuickSet(field, value);
            setActiveField(null);
            setInputValue("");
        }
    };

    const activeFieldDef = activeField 
        ? quickSetFields.find(f => f.key === activeField) 
        : null;

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-3 bg-background border rounded-lg shadow-lg px-4 py-3">
                {/* Selection count */}
                <div className="flex items-center gap-2 pr-3 border-r">
                    <span className="font-medium">{selectedCount} selected</span>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={onClearSelection}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Field selector and input */}
                {onQuickSet && quickSetFields.length > 0 && (
                    <div className="flex items-center gap-2">
                        {activeField && activeFieldDef ? (
                            <>
                                <span className="text-sm text-muted-foreground">
                                    {activeFieldDef.label}:
                                </span>
                                <Input
                                    className="h-8 w-40"
                                    placeholder={`Enter ${activeFieldDef.label.toLowerCase()}`}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            handleQuickSet(activeField, inputValue);
                                        } else if (e.key === "Escape") {
                                            setActiveField(null);
                                            setInputValue("");
                                        }
                                    }}
                                    autoFocus
                                    disabled={isLoading}
                                />
                                <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={() => handleQuickSet(activeField, inputValue)}
                                    disabled={!inputValue || isLoading}
                                >
                                    Apply
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => {
                                        setActiveField(null);
                                        setInputValue("");
                                    }}
                                >
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            <Select
                                onValueChange={(field) => setActiveField(field)}
                                disabled={isLoading}
                            >
                                <SelectTrigger className="h-8 w-36">
                                    <SelectValue placeholder="Set field..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {quickSetFields.map((field) => (
                                        <SelectItem key={field.key} value={field.key}>
                                            {field.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}

                {/* Divider before actions */}
                {(onRecalculate || onApprove || onUnapprove) && <div className="h-6 border-l" />}

                {/* Recalculate with dropdown for field selection */}
                {onRecalculate && (
                    computedFields.length > 1 ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    disabled={isLoading}
                                >
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Recalculate
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onRecalculate()}>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    All Computed Fields
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {computedFields.map((field) => (
                                    <DropdownMenuItem 
                                        key={field.key}
                                        onClick={() => onRecalculate([field.key])}
                                    >
                                        {field.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => onRecalculate()}
                            disabled={isLoading}
                        >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Recalculate
                        </Button>
                    )
                )}

                {onUnapprove && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={onUnapprove}
                        disabled={isLoading}
                    >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Unapprove
                    </Button>
                )}

                {onApprove && (
                    <Button
                        size="sm"
                        className="h-8"
                        onClick={onApprove}
                        disabled={isLoading}
                    >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                    </Button>
                )}
            </div>
        </div>
    );
}

