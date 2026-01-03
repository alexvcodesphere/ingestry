"use client";

/**
 * Draft Order Grid Component
 * Editable data grid for human-in-the-loop validation of extracted products.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    flexRender,
    type ColumnDef,
    type RowSelectionState,
    type SortingState,
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { EditableCell } from "./EditableCell";
import { StatusBadge } from "./StatusBadge";
import type { DraftLineItem, NormalizedProduct, LineItemStatus, FieldDefinition, ExportConfig } from "@/types";
import { FloatingActionBar, type QuickSetField } from "./FloatingActionBar";
import { SparkToggleButton } from "./IngestrySpark";
import { SourceLegend } from "@/components/ui/SourceTooltip";

/** Type for AI uncertainty flags stored in _needs_checking */
interface NeedsCheckingFlag {
    field: string;
    reason: string;
}

interface DraftOrderGridProps {
    lineItems: DraftLineItem[];
    orderId: string;
    onUpdateItem: (itemId: string, updates: Partial<NormalizedProduct>) => Promise<void>;
    onApproveItems: (itemIds: string[]) => Promise<void>;
    onUnapproveItems?: (itemIds: string[]) => Promise<void>;
    onApproveAll: () => Promise<void>;
    onRegenerateTemplates?: (itemIds: string[]) => Promise<void>;
    onBulkUpdate?: (itemIds: string[], updates: Partial<NormalizedProduct>) => Promise<void>;
    onRefreshData?: () => Promise<void>;
    onSelectionChange?: (selectedIds: string[]) => void;
    onSparkToggle?: () => void;
    isSubmitting?: boolean;
    /** Field key to label mapping from processing profile */
    fieldLabels?: Record<string, string>;
    /** Field keys that use templates (show regenerate button) */
    templatedFields?: string[];
    /** Full field definitions for lineage styling */
    profileFields?: FieldDefinition[];
    /** Active export config for mapping status */
    activeExportConfig?: ExportConfig;
}

// Fields that should be treated as numbers
const NUMBER_FIELDS = new Set(["price", "quantity"]);

// Skip these internal/computed fields
const SKIP_FIELDS = new Set(["id", "validation_errors", "_needs_checking"]);

/** Helper to get uncertainty flag for a specific field */
function getFieldUncertainty(data: Record<string, unknown> | undefined, fieldKey: string): NeedsCheckingFlag | undefined {
    const flags = data?._needs_checking as NeedsCheckingFlag[] | undefined;
    return flags?.find(f => f.field === fieldKey);
}

export function DraftOrderGrid({
    lineItems,
    orderId,
    onUpdateItem,
    onApproveItems,
    onUnapproveItems,
    onApproveAll,
    onRegenerateTemplates,
    onBulkUpdate,
    onRefreshData,
    onSelectionChange,
    onSparkToggle,
    isSubmitting = false,
    fieldLabels = {},
    templatedFields = [],
    profileFields = [],
    activeExportConfig,
}: DraftOrderGridProps) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [updatingRows, setUpdatingRows] = useState<Set<string>>(new Set());
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkEditData, setBulkEditData] = useState<Record<string, string | number>>({});
    const [isBulkSaving, setIsBulkSaving] = useState(false);
    const lastClickedRowIndex = useRef<number | null>(null);

    // Dynamically derive editable columns from the actual data
    const editableColumns = useMemo(() => {
        const fieldSet = new Set<string>();
        for (const item of lineItems) {
            const data = item.normalized_data as unknown as Record<string, unknown>;
            if (data) {
                for (const key of Object.keys(data)) {
                    if (!SKIP_FIELDS.has(key)) {
                        fieldSet.add(key);
                    }
                }
            }
        }
        return Array.from(fieldSet).map((key) => {
            // Find field definition to determine source type
            const fieldDef = profileFields.find(f => f.key === key);
            return {
                key,
                label: fieldLabels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
                type: NUMBER_FIELDS.has(key) ? "number" : "text",
                sourceType: fieldDef?.source || 'extracted',
                logicType: fieldDef?.logic_type,
            };
        });
    }, [lineItems, fieldLabels, profileFields]);

    // Debug: Log discovered fields (check browser console)
    useEffect(() => {
        if (editableColumns.length > 0) {
            console.log("[DraftOrderGrid] editableColumns length:", editableColumns.length);
            console.log("[DraftOrderGrid] editableColumns:", JSON.stringify(editableColumns, null, 2));
        }
    }, [editableColumns]);

    const handleCellUpdate = useCallback(
        async (itemId: string, field: keyof NormalizedProduct, value: string | number) => {
            setUpdatingRows((prev) => new Set(prev).add(itemId));
            try {
                await onUpdateItem(itemId, { [field]: value });
            } finally {
                setUpdatingRows((prev) => {
                    const next = new Set(prev);
                    next.delete(itemId);
                    return next;
                });
            }
        },
        [onUpdateItem]
    );

    const handleRegenerateTemplates = useCallback(async (itemIds: string[]) => {
        if (!onRegenerateTemplates) return;
        setIsRegenerating(true);
        setRegeneratingIds(new Set(itemIds));
        try {
            await onRegenerateTemplates(itemIds);
        } finally {
            setIsRegenerating(false);
            setRegeneratingIds(new Set());
        }
    }, [onRegenerateTemplates]);

    const handleBulkEdit = useCallback(async () => {
        if (!onBulkUpdate) return;
        const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
        if (selectedIds.length === 0) return;

        // Filter out empty values and convert to proper types
        const updates: Record<string, string | number> = {};
        for (const [key, value] of Object.entries(bulkEditData)) {
            if (value !== "" && value !== undefined) {
                const fieldDef = editableColumns.find((f: { key: string }) => f.key === key);
                if (fieldDef?.type === "number" && typeof value === "string") {
                    updates[key] = parseFloat(value) || 0;
                } else {
                    updates[key] = value;
                }
            }
        }

        if (Object.keys(updates).length === 0) {
            setIsBulkEditOpen(false);
            return;
        }

        setIsBulkSaving(true);
        try {
            await onBulkUpdate(selectedIds, updates as Partial<NormalizedProduct>);
            setIsBulkEditOpen(false);
            setBulkEditData({});
        } finally {
            setIsBulkSaving(false);
        }
    }, [rowSelection, bulkEditData, onBulkUpdate]);

    // Generate dynamic data columns from editableColumns
    const dataColumns = useMemo<ColumnDef<DraftLineItem>[]>(() => {
        return editableColumns.map((field) => ({
            id: field.key,
            accessorFn: (row: DraftLineItem) => {
                const data = row.normalized_data as unknown as Record<string, unknown>;
                return data?.[field.key] ?? "";
            },
            header: ({ column }) => {
                // Determine if this field is mapped to export
                const isMapped = activeExportConfig?.field_mappings?.some(
                    m => m.source === field.key
                ) ?? false;
                const isVirtual = field.sourceType === 'computed';
                
                // Check if any row has validation errors for this field
                const hasErrors = lineItems.some(item => 
                    item.validation_errors?.some(e => e.field === field.key)
                );
                
                return (
                    <button
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors w-full text-left"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        {/* Badge matching TransformTab style */}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${
                            isVirtual
                                ? 'bg-purple-100 dark:bg-purple-900/80 text-purple-600 dark:text-purple-400'
                                : 'bg-blue-100 dark:bg-blue-900/80 text-blue-600 dark:text-blue-400'
                        }`}>
                            {isVirtual ? 'V' : 'S'}
                        </span>
                        <span>{field.label}</span>
                        {/* Show error indicator if any row has validation errors in this column */}
                        {hasErrors && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        <p className="text-xs">Some rows have validation errors</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        {/* Show warning for unmapped fields - only if no errors to avoid clutter */}
                        {!hasErrors && !isMapped && activeExportConfig && (
                            <span className="text-amber-500 text-[10px] shrink-0" title="Not mapped to export">⚠</span>
                        )}
                        {column.getIsSorted() === "asc" ? " ↑" : column.getIsSorted() === "desc" ? " ↓" : ""}
                    </button>
                );
            },
            // Store source type in meta for cell background styling
            meta: {
                sourceType: field.sourceType,
            },
            enableSorting: true,
            cell: ({ row }: { row: { original: DraftLineItem } }) => {
                const item = row.original;
                const data = item.normalized_data as unknown as Record<string, unknown>;
                const error = item.validation_errors?.find((e) => e.field === field.key);
                const value = data?.[field.key] ?? "";

                // Special handling for templated fields with regenerate button
                if (templatedFields.includes(field.key) && onRegenerateTemplates) {
                    const isRegenThis = regeneratingIds.has(item.id);
                    const isApproved = item.status === "approved";
                    return (
                        <div className="flex items-center gap-1">
                            <EditableCell
                                value={String(value)}
                                onChange={(v) => handleCellUpdate(item.id, field.key as keyof NormalizedProduct, field.type === "number" ? parseFloat(v) || 0 : v)}
                                hasError={!!error}
                                errorMessage={error?.message}
                                disabled={updatingRows.has(item.id) || isRegenThis || isApproved}
                                type={field.type === "number" ? "number" : undefined}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs shrink-0"
                                onClick={() => handleRegenerateTemplates([item.id])}
                                disabled={isRegenerating || isRegenThis}
                                title="Recalculate from template"
                            >
                                {isRegenThis ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                    "↻"
                                )}
                            </Button>
                        </div>
                    );
                }

                const uncertaintyFlag = getFieldUncertainty(data, field.key);
                const isApproved = item.status === "approved";

                // Wrap cell content with uncertainty indicator if flagged
                const cellContent = (
                    <EditableCell
                        value={field.type === "number" ? Number(value) || 0 : String(value)}
                        onChange={(v) => handleCellUpdate(item.id, field.key as keyof NormalizedProduct, field.type === "number" ? parseFloat(v) || 0 : v)}
                        hasError={!!error}
                        errorMessage={error?.message}
                        disabled={updatingRows.has(item.id) || isApproved}
                        type={field.type === "number" ? "number" : undefined}
                    />
                );

                // If there's an uncertainty flag, wrap with indicator
                if (uncertaintyFlag) {
                    return (
                        <div className="flex items-center gap-1">
                            {cellContent}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-sm">{uncertaintyFlag.reason}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    );
                }

                return cellContent;
            },
            size: field.key === "name" ? 200 : field.key === "sku" ? 180 : 100,
        }));
    }, [editableColumns, handleCellUpdate, updatingRows, templatedFields, onRegenerateTemplates, handleRegenerateTemplates, isRegenerating, regeneratingIds, activeExportConfig]);

    // Combine static columns with dynamic data columns
    const columns = useMemo<ColumnDef<DraftLineItem>[]>(
        () => [
            {
                id: "select",
                header: ({ table }) => (
                    <input
                        type="checkbox"
                        checked={table.getIsAllRowsSelected()}
                        onChange={(e) => table.toggleAllRowsSelected(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                ),
                cell: ({ row, table }) => {
                    const currentIndex = table.getRowModel().rows.findIndex(r => r.id === row.id);
                    
                    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
                        if (e.shiftKey && lastClickedRowIndex.current !== null) {
                            // Shift+Click: select range
                            const rows = table.getRowModel().rows;
                            const start = Math.min(lastClickedRowIndex.current, currentIndex);
                            const end = Math.max(lastClickedRowIndex.current, currentIndex);
                            
                            const newSelection: RowSelectionState = { ...rowSelection };
                            for (let i = start; i <= end; i++) {
                                newSelection[rows[i].id] = true;
                            }
                            setRowSelection(newSelection);
                        } else {
                            // Regular click: toggle single row
                            row.toggleSelected(!row.getIsSelected());
                            lastClickedRowIndex.current = currentIndex;
                        }
                    };
                    
                    return (
                        <input
                            type="checkbox"
                            checked={row.getIsSelected()}
                            onClick={handleClick}
                            onChange={() => {}} // Handled by onClick
                            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                        />
                    );
                },
                size: 40,
            },
            {
                id: "status",
                header: "Status",
                cell: ({ row }) => (
                    <StatusBadge status={row.original.status as LineItemStatus} />
                ),
                size: 80,
            },
            {
                accessorKey: "line_number",
                header: "#",
                cell: ({ row }) => (
                    <span className="text-muted-foreground text-sm">
                        {row.original.line_number}
                    </span>
                ),
                size: 40,
            },
            ...dataColumns,
        ],
        [dataColumns, rowSelection]
    );

    const table = useReactTable({
        data: lineItems,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        onRowSelectionChange: setRowSelection,
        state: { rowSelection },
        getRowId: (row) => row.id,
    });

    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    
    // Notify parent of selection changes
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedIds);
        }
    }, [selectedIds.join(','), onSelectionChange]);

    const stats = useMemo(() => {
        const pending = lineItems.filter((i) => i.status === "pending").length;
        const validated = lineItems.filter((i) => i.status === "validated").length;
        const error = lineItems.filter((i) => i.status === "error").length;
        const approved = lineItems.filter((i) => i.status === "approved").length;
        return { total: lineItems.length, pending, validated, error, approved };
    }, [lineItems]);

    const allApproved = stats.approved === stats.total && stats.total > 0;
    const canApprove = stats.error === 0 && !allApproved;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium">{stats.total} items</span>
                    <span className="text-muted-foreground">
                        {stats.approved} approved, {stats.validated} validated, {stats.error} with errors
                    </span>
                    <span className="border-l pl-4">
                        <SourceLegend compact />
                    </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Spark toggle button */}
                    {onSparkToggle && (
                        <SparkToggleButton onClick={onSparkToggle} selectedCount={selectedIds.length} />
                    )}
                    <Button
                        variant="default"
                        size="sm"
                        onClick={onApproveAll}
                        disabled={isSubmitting || allApproved || !canApprove}
                    >
                        {allApproved ? "All Approved ✓" : "Approve All"}
                    </Button>
                </div>
            </div>

            <div className={`rounded-md border overflow-hidden`}>
                <Table containerClassName="max-h-[600px]">
                <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const meta = header.column.columnDef.meta as { sourceType?: string } | undefined;
                                    const bgClass = meta?.sourceType === 'computed'
                                        ? 'bg-purple-50/50 dark:bg-purple-950/30'
                                        : meta?.sourceType === 'extracted'
                                            ? 'bg-blue-50/50 dark:bg-blue-950/30'
                                            : '';
                                    return (
                                        <TableHead 
                                            key={header.id} 
                                            style={{ width: header.column.getSize() }}
                                            className={bgClass}
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={row.getIsSelected() && "selected"}
                                    className={
                                        row.original.status === "approved"
                                            ? "bg-green-50/50 dark:bg-green-950/20"
                                            : undefined
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => {
                                        const meta = cell.column.columnDef.meta as { sourceType?: string } | undefined;
                                        const bgClass = meta?.sourceType === 'computed'
                                            ? 'bg-purple-50/30 dark:bg-purple-950/20'
                                            : meta?.sourceType === 'extracted'
                                                ? 'bg-blue-50/30 dark:bg-blue-950/20'
                                                : '';
                                        return (
                                            <TableCell key={cell.id} className={bgClass}>
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    No items to display
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Floating Action Bar for bulk operations */}
            {(() => {
                // Determine if selected items contain any approved ones
                const hasApprovedSelected = selectedIds.some(id => 
                    lineItems.find(i => i.id === id)?.status === 'approved'
                );
                const hasUnapprovedSelected = selectedIds.some(id => 
                    lineItems.find(i => i.id === id)?.status !== 'approved'
                );
                
                return (
                    <FloatingActionBar
                        selectedCount={selectedIds.length}
                        onClearSelection={() => setRowSelection({})}
                        // Show Approve only if there are unapproved items and no approved items
                        onApprove={hasUnapprovedSelected && !hasApprovedSelected 
                            ? () => onApproveItems(selectedIds) 
                            : undefined}
                        // Show Unapprove only if there are approved items selected
                        onUnapprove={hasApprovedSelected && onUnapproveItems 
                            ? () => onUnapproveItems(selectedIds.filter(id => lineItems.find(i => i.id === id)?.status === 'approved')) 
                            : undefined}
                        onRecalculate={
                            selectedIds.length > 0 && onRegenerateTemplates && templatedFields.length > 0
                                ? () => handleRegenerateTemplates(selectedIds)
                                : undefined
                        }
                        onQuickSet={onBulkUpdate ? (field, value) => {
                            onBulkUpdate(selectedIds, { [field]: value } as Partial<NormalizedProduct>);
                        } : undefined}
                        quickSetFields={editableColumns.map(col => ({
                            key: col.key,
                            label: col.label,
                            type: "text" as const,
                        }))}
                        isLoading={isBulkSaving || isRegenerating}
                    />
                );
            })()}

            <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit {selectedIds.length} Items</DialogTitle>
                        <DialogDescription>
                            Changes apply to all selected items. Leave empty to keep current values.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="max-h-[60vh] overflow-y-auto pr-2">
                        <p className="text-xs text-muted-foreground mb-4">
                            {editableColumns.length} fields available
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            {editableColumns.map((field) => (
                                <div key={field.key} className="space-y-1">
                                    <Label htmlFor={`bulk-${field.key}`} className="text-sm">
                                        {field.label}
                                        <span className="ml-1 text-xs text-muted-foreground">({field.key})</span>
                                    </Label>
                                    <Input
                                        id={`bulk-${field.key}`}
                                        type={field.type || "text"}
                                        value={(bulkEditData as Record<string, string | number>)[field.key] ?? ""}
                                        onChange={(e) =>
                                            setBulkEditData((prev) => ({
                                                ...prev,
                                                [field.key]: field.type === "number" ? parseFloat(e.target.value) || "" : e.target.value,
                                            }))
                                        }
                                        placeholder={field.label}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>Cancel</Button>
                        <Button onClick={handleBulkEdit} disabled={isBulkSaving}>
                            {isBulkSaving ? "Applying..." : "Apply Changes"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
