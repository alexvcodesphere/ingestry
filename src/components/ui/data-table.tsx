"use client";

import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export interface Column<T> {
    key: string;
    header: string;
    className?: string;
    hiddenOnMobile?: boolean;
    render: (item: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
    title: string;
    titleAction?: ReactNode;
    columns: Column<T>[];
    data: T[];
    keyExtractor: (item: T) => string;
    isLoading?: boolean;
    emptyMessage?: string;
    // Pagination
    page: number;
    pageSize: number;
    pageSizeOptions?: number[];
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (pageSize: number) => void;
}

export function DataTable<T>({
    title,
    titleAction,
    columns,
    data,
    keyExtractor,
    isLoading = false,
    emptyMessage = "No data yet.",
    page,
    pageSize,
    pageSizeOptions: propPageSizeOptions,
    total,
    onPageChange,
    onPageSizeChange,
}: DataTableProps<T>) {
    const isMobile = useIsMobile();
    const visibleColumns = isMobile 
        ? columns.filter(col => !col.hiddenOnMobile) 
        : columns;
    const pageSizeOptions = propPageSizeOptions || [10, 25, 50];
    const totalPages = Math.ceil(total / pageSize);
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, total);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
                <CardTitle className="text-base font-medium">{title}</CardTitle>
                {titleAction}
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
                    </div>
                ) : data.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        {emptyMessage}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    {visibleColumns.map((col) => (
                                        <TableHead key={col.key} className={col.className}>
                                            {col.header}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.map((item, index) => (
                                    <TableRow key={keyExtractor(item)} className="group">
                                        {visibleColumns.map((col) => (
                                            <TableCell key={col.key} className={col.className}>
                                                {col.render(item, index)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
                {total > 0 && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span>
                                {total > 0 ? `${start}–${end} of ${total}` : "0 items"}
                            </span>
                            {onPageSizeChange && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Show</span>
                                    <Select
                                        value={String(pageSize)}
                                        onValueChange={(value) => onPageSizeChange(Number(value))}
                                    >
                                        <SelectTrigger className="h-8 w-[70px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pageSizeOptions.map((size) => (
                                                <SelectItem key={size} value={String(size)}>
                                                    {size}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-sm text-muted-foreground">rows</span>
                                </div>
                            )}
                        </div>
                        <Pagination className="mx-0 w-auto justify-end">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page > 0) onPageChange(page - 1);
                                        }}
                                        className={page === 0 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                                {totalPages > 0 && (
                                    <PaginationItem>
                                        <PaginationLink href="#" isActive>
                                            {page + 1}
                                        </PaginationLink>
                                    </PaginationItem>
                                )}
                                {totalPages > 1 && (
                                    <PaginationItem>
                                        <span className="px-2 text-sm text-muted-foreground">
                                            of {totalPages}
                                        </span>
                                    </PaginationItem>
                                )}
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (page < totalPages - 1) onPageChange(page + 1);
                                        }}
                                        className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : ""}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
