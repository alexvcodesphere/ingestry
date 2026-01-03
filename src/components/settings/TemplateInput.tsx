"use client";

/**
 * TemplateInput - Input with autocomplete for template variables
 * Shows dropdown when typing { with search functionality
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Search, Braces } from "lucide-react";

interface TemplateInputProps {
    value: string;
    onChange: (value: string) => void;
    variables: string[];
    placeholder?: string;
    className?: string;
}

export function TemplateInput({
    value,
    onChange,
    variables,
    placeholder = "{field}-{other:2}",
    className = "",
}: TemplateInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [search, setSearch] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    // Filter variables based on search
    const filteredVars = variables.filter(v =>
        v.toLowerCase().includes(search.toLowerCase())
    );

    // Find word being typed (after last {)
    const getPartialWord = useCallback(() => {
        const beforeCursor = value.substring(0, cursorPosition);
        const lastBrace = beforeCursor.lastIndexOf("{");
        if (lastBrace === -1) return "";
        return beforeCursor.substring(lastBrace + 1);
    }, [value, cursorPosition]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const newCursor = e.target.selectionStart || 0;
        onChange(newValue);
        setCursorPosition(newCursor);

        // Show dropdown if typing after {
        const beforeCursor = newValue.substring(0, newCursor);
        const lastBrace = beforeCursor.lastIndexOf("{");
        const lastClose = beforeCursor.lastIndexOf("}");
        
        if (lastBrace > lastClose) {
            setShowDropdown(true);
            setSearch(beforeCursor.substring(lastBrace + 1));
            setHighlightedIndex(0);
        } else {
            setShowDropdown(false);
            setSearch("");
        }
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showDropdown) return;

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightedIndex(i => Math.min(i + 1, filteredVars.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex(i => Math.max(i - 1, 0));
                break;
            case "Enter":
            case "Tab":
                if (filteredVars.length > 0) {
                    e.preventDefault();
                    insertVariable(filteredVars[highlightedIndex]);
                }
                break;
            case "Escape":
                setShowDropdown(false);
                break;
        }
    };

    // Insert variable at cursor
    const insertVariable = (variable: string) => {
        const beforeCursor = value.substring(0, cursorPosition);
        const afterCursor = value.substring(cursorPosition);
        const lastBrace = beforeCursor.lastIndexOf("{");
        
        // Replace from { to cursor with the complete variable
        const newValue = beforeCursor.substring(0, lastBrace + 1) + variable + "}" + afterCursor;
        onChange(newValue);
        setShowDropdown(false);
        setSearch("");

        // Move cursor after the inserted variable
        const newCursor = lastBrace + 1 + variable.length + 1;
        setTimeout(() => {
            inputRef.current?.setSelectionRange(newCursor, newCursor);
            inputRef.current?.focus();
        }, 0);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Track cursor position on click/focus
    const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
        setCursorPosition(e.currentTarget.selectionStart || 0);
    };

    return (
        <div className="relative">
            <Input
                ref={inputRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onSelect={handleSelect}
                onClick={handleSelect}
                placeholder={placeholder}
                className={`font-mono text-sm ${className}`}
            />
            
            {/* Autocomplete Dropdown */}
            {showDropdown && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 top-full left-0 mt-1 w-full max-w-xs bg-popover border rounded-lg shadow-lg overflow-hidden"
                >
                    {/* Search Header */}
                    <div className="p-2 border-b bg-muted/30">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                placeholder="Search variables..."
                                className="w-full pl-7 pr-2 py-1.5 text-sm bg-transparent border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                                autoFocus
                            />
                        </div>
                    </div>
                    
                    {/* Variable List */}
                    <div className="max-h-48 overflow-y-auto">
                        {filteredVars.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                                No variables found
                            </div>
                        ) : (
                            filteredVars.map((v, i) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => insertVariable(v)}
                                    onMouseEnter={() => setHighlightedIndex(i)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                                        i === highlightedIndex
                                            ? "bg-accent text-accent-foreground"
                                            : "hover:bg-muted/50"
                                    }`}
                                >
                                    <Braces className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-mono">{`{${v}}`}</span>
                                    <span className="text-muted-foreground text-xs ml-auto">
                                        :{`n`} for length
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                    
                    {/* Footer Hint */}
                    <div className="p-2 border-t bg-muted/30 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>↑↓ navigate • Enter to select</span>
                        <span>:2 = first 2 chars</span>
                    </div>
                </div>
            )}
        </div>
    );
}
