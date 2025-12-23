"use client";

/**
 * Draft Order Grid Component
 * Editable data grid for human-in-the-loop validation of extracted products.
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    flexRender,
    type ColumnDef,
    type RowSelectionState,
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
import { EditableCell } from "./EditableCell";
import { StatusBadge, ValidationErrors } from "./StatusBadge";
import type { DraftLineItem, NormalizedProduct, LineItemStatus } from "@/types";

interface DraftOrderGridProps {
    lineItems: DraftLineItem[];
    onUpdateItem: (itemId: string, updates: Partial<NormalizedProduct>) => Promise<void>;
    onApproveItems: (itemIds: string[]) => Promise<void>;
    onApproveAll: () => Promise<void>;
    onRegenerateSku?: (itemIds: string[]) => Promise<void>;
    onBulkUpdate?: (itemIds: string[], updates: Partial<NormalizedProduct>) => Promise<void>;
    isSubmitting?: boolean;
    /** Field key to label mapping from processing profile */
    fieldLabels?: Record<string, string>;
}

// Fields that should be treated as numbers
const NUMBER_FIELDS = new Set(["price", "quantity"]);

// Skip these internal/computed fields
const SKIP_FIELDS = new Set(["id", "validation_errors"]);

export function DraftOrderGrid({
    lineItems,
    onUpdateItem,
    onApproveItems,
    onApproveAll,
    onRegenerateSku,
    onBulkUpdate,
    isSubmitting = false,
    fieldLabels = {},
}: DraftOrderGridProps) {
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [updatingRows, setUpdatingRows] = useState<Set<string>>(new Set());
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [bulkEditData, setBulkEditData] = useState<Record<string, string | number>>({});
    const [isBulkSaving, setIsBulkSaving] = useState(false);

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
        return Array.from(fieldSet).map((key) => ({
            key,
            label: fieldLabels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " "),
            type: NUMBER_FIELDS.has(key) ? "number" : "text",
        }));
    }, [lineItems, fieldLabels]);

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

    const handleRegenerateSku = useCallback(async (itemIds: string[]) => {
        if (!onRegenerateSku) return;
        setIsRegenerating(true);
        setRegeneratingIds(new Set(itemIds));
        try {
            await onRegenerateSku(itemIds);
        } finally {
            setIsRegenerating(false);
            setRegeneratingIds(new Set());
        }
    }, [onRegenerateSku]);

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
            header: field.label,
            cell: ({ row }: { row: { original: DraftLineItem } }) => {
                const item = row.original;
                const data = item.normalized_data as unknown as Record<string, unknown>;
                const error = item.validation_errors?.find((e) => e.field === field.key);
                const value = data?.[field.key] ?? "";

                // Special handling for SKU with regenerate button
                if (field.key === "sku" && onRegenerateSku) {
                    const isRegenThis = regeneratingIds.has(item.id);
                    return (
                        <div className="flex items-center gap-1">
                            <EditableCell
                                value={String(value)}
                                onChange={(v) => handleCellUpdate(item.id, field.key as keyof NormalizedProduct, field.type === "number" ? parseFloat(v) || 0 : v)}
                                hasError={!!error}
                                errorMessage={error?.message}
                                disabled={updatingRows.has(item.id) || isRegenThis}
                                type={field.type === "number" ? "number" : undefined}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs shrink-0"
                                onClick={() => handleRegenerateSku([item.id])}
                                disabled={isRegenerating || isRegenThis}
                                title="Regenerate SKU"
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

                return (
                    <EditableCell
                        value={field.type === "number" ? Number(value) || 0 : String(value)}
                        onChange={(v) => handleCellUpdate(item.id, field.key as keyof NormalizedProduct, field.type === "number" ? parseFloat(v) || 0 : v)}
                        hasError={!!error}
                        errorMessage={error?.message}
                        disabled={updatingRows.has(item.id)}
                        type={field.type === "number" ? "number" : undefined}
                    />
                );
            },
            size: field.key === "name" ? 200 : field.key === "sku" ? 180 : 100,
        }));
    }, [editableColumns, handleCellUpdate, updatingRows, onRegenerateSku, handleRegenerateSku, isRegenerating, regeneratingIds]);

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
                cell: ({ row }) => (
                    <input
                        type="checkbox"
                        checked={row.getIsSelected()}
                        onChange={(e) => row.toggleSelected(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                    />
                ),
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
            {
                id: "errors",
                header: "Issues",
                cell: ({ row }) => (
                    <ValidationErrors errors={row.original.validation_errors || []} />
                ),
                size: 150,
            },
        ],
        [dataColumns]
    );

    const table = useReactTable({
        data: lineItems,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onRowSelectionChange: setRowSelection,
        state: { rowSelection },
        getRowId: (row) => row.id,
    });

    const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);

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
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {selectedIds.length > 0 && (
                        <>
                            {onBulkUpdate && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsBulkEditOpen(true)}
                                >
                                    Edit Selected ({selectedIds.length})
                                </Button>
                            )}
                            {onRegenerateSku && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRegenerateSku(selectedIds)}
                                    disabled={isRegenerating}
                                >
                                    {isRegenerating ? (
                                        <span className="flex items-center gap-1">
                                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                            Regenerating...
                                        </span>
                                    ) : (
                                        `Regenerate SKUs (${selectedIds.length})`
                                    )}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onApproveItems(selectedIds)}
                                disabled={isSubmitting}
                            >
                                Approve Selected ({selectedIds.length})
                            </Button>
                        </>
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

            <div className="rounded-md border overflow-auto max-h-[600px]">
                <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} style={{ width: header.column.getSize() }}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
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
                                        row.original.status === "error"
                                            ? "bg-red-50/50 dark:bg-red-950/20"
                                            : row.original.status === "approved"
                                                ? "bg-green-50/50 dark:bg-green-950/20"
                                                : undefined
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </TableCell>
                                    ))}
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
