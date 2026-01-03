"use client";

/**
 * TemplateInput Component
 * Input with autocomplete for template variables.
 * Shows available field keys when typing '{' with search functionality.
 * 
 * Supports two interfaces:
 * - `fields: FieldConfig[]` - Rich field metadata with labels and catalog info
 * - `variables: string[]` - Simple string list (backwards compatible)
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Search, Braces } from "lucide-react";

export interface FieldConfig {
    key: string;
    label: string;
    catalog_key?: string;
    use_template?: boolean;
    source?: 'extracted' | 'computed';
    fallback?: string;
}

interface Suggestion {
    text: string;
    description: string;
    insertText: string;
}

// Base props
interface BaseProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    catalogCustomColumns?: Record<string, string[]>;
}

// Props with fields (rich metadata)
interface FieldsProps extends BaseProps {
    fields: FieldConfig[];
    variables?: never;
}

// Props with variables (simple string list)
interface VariablesProps extends BaseProps {
    variables: string[];
    fields?: never;
}

export type TemplateInputProps = FieldsProps | VariablesProps;

function buildSuggestions(
    fields?: FieldConfig[], 
    variables?: string[],
    catalogCustomColumns?: Record<string, string[]>
): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Add sequence (always available)
    suggestions.push({
        text: "sequence",
        description: "Line number in batch",
        insertText: "{sequence}",
    });

    // Build from fields (rich mode)
    if (fields) {
        for (const field of fields) {
            // Skip computed fields - they can't be used as source values in templates
            if (field.use_template || field.source === 'computed') continue;

            // Basic variable
            suggestions.push({
                text: field.key,
                description: field.label,
                insertText: `{${field.key}}`,
            });

            // .code modifier for fields with catalog_key
            if (field.catalog_key) {
                suggestions.push({
                    text: `${field.key}.code`,
                    description: `Code from ${field.catalog_key} catalog`,
                    insertText: `{${field.key}.code}`,
                });
                
                // Add known custom columns
                const customCols = catalogCustomColumns?.[field.catalog_key];
                if (customCols && customCols.length > 0) {
                    for (const col of customCols) {
                        suggestions.push({
                            text: `${field.key}.${col}`,
                            description: `Custom: ${col}`,
                            insertText: `{${field.key}.${col}}`,
                        });
                    }
                } else {
                    // Fallback hint for custom columns
                    suggestions.push({
                        text: `${field.key}.custom_col`,
                        description: `Custom column from ${field.catalog_key}`,
                        insertText: `{${field.key}.`,
                    });
                }
            }
        }
    }

    // Build from variables (simple mode)
    if (variables) {
        for (const v of variables) {
            suggestions.push({
                text: v,
                description: `Insert {${v}}`,
                insertText: `{${v}}`,
            });
        }
    }

    return suggestions;
}

export function TemplateInput(props: TemplateInputProps) {
    const { 
        value, 
        onChange, 
        placeholder = "e.g. {brand}-{color:2}", 
        className,
        catalogCustomColumns 
    } = props;
    const fields = 'fields' in props ? props.fields : undefined;
    const variables = 'variables' in props ? props.variables : undefined;

    const inputRef = React.useRef<HTMLInputElement>(null);
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);
    const [showDropdown, setShowDropdown] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const [cursorPosition, setCursorPosition] = React.useState(0);
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);
    const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);

    const suggestions = React.useMemo(
        () => buildSuggestions(fields, variables, catalogCustomColumns),
        [fields, variables, catalogCustomColumns]
    );

    const filteredSuggestions = React.useMemo(() => {
        if (!search) return suggestions;
        const lowerSearch = search.toLowerCase();
        return suggestions.filter(
            (s) =>
                s.text.toLowerCase().includes(lowerSearch) ||
                s.description.toLowerCase().includes(lowerSearch)
        );
    }, [suggestions, search]);

    // Scroll highlighted item into view
    React.useEffect(() => {
        if (showDropdown && listRef.current) {
            const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
            if (highlightedElement) {
                highlightedElement.scrollIntoView({ block: "nearest" });
            }
        }
    }, [highlightedIndex, showDropdown]);

    // Update dropdown position when shown
    React.useLayoutEffect(() => {
        if (showDropdown && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
            });
        }
    }, [showDropdown]);

    // Update position on scroll/resize
    React.useEffect(() => {
        if (!showDropdown) return;
        
        const updatePos = () => {
            if (inputRef.current) {
                const rect = inputRef.current.getBoundingClientRect();
                setDropdownPosition({
                    top: rect.bottom + window.scrollY,
                    left: rect.left + window.scrollX,
                    width: rect.width,
                });
            }
        };

        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        return () => {
            window.removeEventListener('scroll', updatePos, true);
            window.removeEventListener('resize', updatePos);
        };
    }, [showDropdown]);

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
                setHighlightedIndex((i) =>
                    Math.min(i + 1, filteredSuggestions.length - 1)
                );
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex((i) => Math.max(i - 1, 0));
                break;
            case "Enter":
            case "Tab":
                if (filteredSuggestions.length > 0) {
                    e.preventDefault();
                    insertSuggestion(filteredSuggestions[highlightedIndex]);
                }
                break;
            case "Escape":
                setShowDropdown(false);
                break;
        }
    };

    // Insert suggestion at cursor
    const insertSuggestion = (suggestion: Suggestion) => {
        const beforeCursor = value.substring(0, cursorPosition);
        const afterCursor = value.substring(cursorPosition);
        const lastBrace = beforeCursor.lastIndexOf("{");

        // Replace from { to cursor with the complete variable
        const newValue =
            beforeCursor.substring(0, lastBrace) + suggestion.insertText + afterCursor;
        onChange(newValue);
        setShowDropdown(false);
        setSearch("");

        // Move cursor after the inserted variable
        const newCursor = lastBrace + suggestion.insertText.length;
        setTimeout(() => {
            inputRef.current?.setSelectionRange(newCursor, newCursor);
            inputRef.current?.focus();
        }, 0);
    };

    // Close dropdown on outside click
    React.useEffect(() => {
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
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onSelect={handleSelect}
                onClick={handleSelect}
                placeholder={placeholder}
                className={cn(
                    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-border/60 ring-1 ring-inset ring-border/50 h-9 w-full min-w-0 rounded-lg border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:bg-background",
                    "font-mono",
                    className
                )}
            />

            {/* Autocomplete Dropdown - Rendered in Portal to avoid overflow clipping */}
            {showDropdown && dropdownPosition && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-50 bg-card/95 backdrop-blur-md border border-border ring-1 ring-inset ring-border/50 rounded-2xl shadow-xl overflow-hidden"
                    style={{
                        top: dropdownPosition.top + 4, // Add slight offset
                        left: dropdownPosition.left,
                        width: Math.max(300, dropdownPosition.width), // Min width 300px
                        maxHeight: '300px'
                    }}
                >
                    {/* Search Header */}
                    <div className="px-3 py-2.5 border-b border-border/40 bg-muted/40">
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
                    <div 
                        ref={listRef}
                        className="max-h-56 overflow-y-auto"
                    >
                        {filteredSuggestions.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                                No variables found
                            </div>
                        ) : (
                            filteredSuggestions.map((suggestion, i) => (
                                <button
                                    key={suggestion.text}
                                    type="button"
                                    onClick={() => insertSuggestion(suggestion)}
                                    onMouseEnter={() => setHighlightedIndex(i)}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors",
                                        i === highlightedIndex
                                            ? "bg-primary/10 text-primary"
                                            : "hover:bg-muted/50"
                                    )}
                                >
                                    <Braces className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <code className="font-mono text-xs bg-muted px-1 rounded">
                                        {suggestion.insertText}
                                    </code>
                                    <span className="text-muted-foreground text-xs ml-auto truncate max-w-[140px]">
                                        {suggestion.description}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer Hint */}
                    <div className="px-3 py-2 border-t border-border/40 bg-muted/40 text-[10px] text-muted-foreground flex items-center justify-between">
                        <span>↑↓ navigate • Enter to select</span>
                        <span className="font-mono">:2 (len)</span>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}