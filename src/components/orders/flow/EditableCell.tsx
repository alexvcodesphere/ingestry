"use client";

/**
 * Editable Cell Component
 * Provides click-to-edit behavior for table cells
 */

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableCellProps {
    value: string | number;
    onChange: (value: string) => void;
    type?: "text" | "number";
    className?: string;
    disabled?: boolean;
    hasError?: boolean;
    errorMessage?: string;
}

export function EditableCell({
    value,
    onChange,
    type = "text",
    className,
    disabled = false,
    hasError = false,
    errorMessage,
}: EditableCellProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(String(value));
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setEditValue(String(value));
    }, [value]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        if (editValue !== String(value)) {
            onChange(editValue);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleBlur();
        } else if (e.key === "Escape") {
            setEditValue(String(value));
            setIsEditing(false);
        }
    };

    if (disabled) {
        return (
            <span className={cn("text-muted-foreground", className)}>
                {value}
            </span>
        );
    }

    if (isEditing) {
        return (
            <Input
                ref={inputRef}
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className={cn(
                    "h-7 px-2 py-1 text-sm",
                    hasError && "border-red-500 focus:ring-red-500",
                    className
                )}
            />
        );
    }

    return (
        <div
            onClick={() => setIsEditing(true)}
            title={hasError ? errorMessage : undefined}
            className={cn(
                "cursor-pointer rounded px-1 py-0.5 hover:bg-muted transition-colors",
                hasError && "bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-700",
                className
            )}
        >
            {value || <span className="text-muted-foreground italic">-</span>}
        </div>
    );
}
