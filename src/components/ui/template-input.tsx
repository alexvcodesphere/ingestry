"use client";

/**
 * TemplateInput Component
 * Input with autocomplete for template variables.
 * Shows available field keys when typing '{'.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FieldConfig {
    key: string;
    label: string;
    normalize_with?: string;
    use_template?: boolean;
    fallback?: string;
}

export interface TemplateInputProps {
    value: string;
    onChange: (value: string) => void;
    fields: FieldConfig[];
    placeholder?: string;
    className?: string;
}

interface Suggestion {
    text: string;
    description: string;
    insertText: string;
}

function buildSuggestions(fields: FieldConfig[]): Suggestion[] {
    const suggestions: Suggestion[] = [];

    // Add sequence (always available)
    suggestions.push({
        text: "sequence",
        description: "Line number in batch",
        insertText: "{sequence}",
    });

    for (const field of fields) {
        // Skip templated fields - they're computed, not source values
        if (field.use_template) continue;

        // Basic variable
        suggestions.push({
            text: field.key,
            description: field.label,
            insertText: `{${field.key}}`,
        });

        // .code modifier for fields with normalize_with
        if (field.normalize_with) {
            suggestions.push({
                text: `${field.key}.code`,
                description: `Code from ${field.normalize_with} lookup`,
                insertText: `{${field.key}.code}`,
            });
        }
    }

    return suggestions;
}

export function TemplateInput({
    value,
    onChange,
    fields,
    placeholder = "e.g. {brand}-{color.code}",
    className,
}: TemplateInputProps) {
    const [showSuggestions, setShowSuggestions] = React.useState(false);
    const [filter, setFilter] = React.useState("");
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const suggestionsRef = React.useRef<HTMLDivElement>(null);

    const suggestions = React.useMemo(() => buildSuggestions(fields), [fields]);

    const filteredSuggestions = React.useMemo(() => {
        if (!filter) return suggestions;
        const lowerFilter = filter.toLowerCase();
        return suggestions.filter(
            (s) =>
                s.text.toLowerCase().includes(lowerFilter) ||
                s.description.toLowerCase().includes(lowerFilter)
        );
    }, [suggestions, filter]);

    // Find the last unclosed '{' position
    const findOpenBrace = (text: string, cursorPos: number): number => {
        let depth = 0;
        for (let i = cursorPos - 1; i >= 0; i--) {
            if (text[i] === "}") depth++;
            if (text[i] === "{") {
                if (depth === 0) return i;
                depth--;
            }
        }
        return -1;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart || 0;
        onChange(newValue);

        // Check if we should show suggestions
        const bracePos = findOpenBrace(newValue, cursorPos);
        if (bracePos !== -1) {
            const textAfterBrace = newValue.slice(bracePos + 1, cursorPos);
            // Only show if no closing brace yet
            if (!textAfterBrace.includes("}")) {
                setFilter(textAfterBrace);
                setShowSuggestions(true);
                setSelectedIndex(0);
                return;
            }
        }
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showSuggestions) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) =>
                Math.min(i + 1, filteredSuggestions.length - 1)
            );
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" || e.key === "Tab") {
            if (filteredSuggestions.length > 0) {
                e.preventDefault();
                insertSuggestion(filteredSuggestions[selectedIndex]);
            }
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
        }
    };

    const insertSuggestion = (suggestion: Suggestion) => {
        const cursorPos = inputRef.current?.selectionStart || value.length;
        const bracePos = findOpenBrace(value, cursorPos);

        if (bracePos !== -1) {
            // Replace from brace to cursor with the suggestion
            const before = value.slice(0, bracePos);
            const after = value.slice(cursorPos);
            const newValue = before + suggestion.insertText + after;
            onChange(newValue);

            // Move cursor after inserted text
            setTimeout(() => {
                const newPos = bracePos + suggestion.insertText.length;
                inputRef.current?.setSelectionRange(newPos, newPos);
            }, 0);
        }

        setShowSuggestions(false);
    };

    // Close suggestions when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(e.target as Node) &&
                !inputRef.current?.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                    // Show suggestions if inside a brace
                    const cursorPos = inputRef.current?.selectionStart || 0;
                    const bracePos = findOpenBrace(value, cursorPos);
                    if (bracePos !== -1) {
                        setFilter(value.slice(bracePos + 1, cursorPos));
                        setShowSuggestions(true);
                    }
                }}
                placeholder={placeholder}
                className={cn(
                    "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    "font-mono",
                    className
                )}
            />

            {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-lg"
                >
                    {filteredSuggestions.map((suggestion, index) => (
                        <div
                            key={suggestion.text}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 cursor-pointer text-sm",
                                index === selectedIndex
                                    ? "bg-accent text-accent-foreground"
                                    : "hover:bg-muted"
                            )}
                            onClick={() => insertSuggestion(suggestion)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            <code className="font-mono text-xs bg-muted px-1 rounded">
                                {suggestion.insertText}
                            </code>
                            <span className="text-muted-foreground text-xs ml-2">
                                {suggestion.description}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
