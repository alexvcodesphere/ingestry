"use client";

/**
 * Orders List Page
 * Displays all draft orders with status, filtering, and navigation to detail views.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Trash2, Pencil } from "lucide-react";
import type { DraftOrder, DraftOrderStatus } from "@/types";

const statusConfig: Record<DraftOrderStatus, { label: string; className: string }> = {
    processing: {
        label: "Processing",
        className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    },
    pending_review: {
        label: "Pending Review",
        className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    approved: {
        label: "Approved",
        className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    exporting: {
        label: "Exporting",
        className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
    exported: {
        label: "Exported",
        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    failed: {
        label: "Failed",
        className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<DraftOrder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<DraftOrderStatus | "all">("all");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");

    const fetchOrders = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== "all") {
                params.set("status", statusFilter);
            }
            params.set("limit", "50");

            const response = await fetch(`/api/draft-orders?${params}`);
            const result = await response.json();

            if (result.success) {
                setOrders(result.data);
            }
        } catch (error) {
            console.error("Failed to fetch orders:", error);
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    const handleDelete = async (orderId: string) => {
        if (!confirm("Delete this order? This cannot be undone.")) return;
        try {
            const response = await fetch(`/api/draft-orders/${orderId}`, {
                method: "DELETE",
            });
            if (response.ok) {
                await fetchOrders();
            } else {
                alert("Failed to delete order");
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("Failed to delete order");
        }
    };

    const handleStartRename = (order: DraftOrder) => {
        setEditingId(order.id);
        setEditingName(order.name || order.source_file_name || `Order ${order.id.slice(0, 8)}`);
    };

    const handleSaveRename = async (orderId: string) => {
        if (!editingName.trim()) {
            setEditingId(null);
            return;
        }
        try {
            const response = await fetch(`/api/draft-orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: editingName.trim() }),
            });
            if (response.ok) {
                // Update local state immediately
                setOrders(orders.map(o => 
                    o.id === orderId ? { ...o, name: editingName.trim() } : o
                ));
            }
        } catch (error) {
            console.error("Rename error:", error);
        }
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, orderId: string) => {
        if (e.key === "Enter") {
            handleSaveRename(orderId);
        } else if (e.key === "Escape") {
            setEditingId(null);
        }
    };

    const getStatusBadge = (status: DraftOrderStatus) => {
        const config = statusConfig[status] || statusConfig.processing;
        return (
            <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
            >
                {config.label}
            </span>
        );
    };

    const getShopSystemBadge = (system: string) => {
        const systemLabels: Record<string, string> = {
            shopware: "Shopware",
            xentral: "Xentral",
            shopify: "Shopify",
        };
        return (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {systemLabels[system] || system}
            </span>
        );
    };

    const getOrderDisplayName = (order: DraftOrder) => {
        return order.name || order.source_file_name || `Order ${order.id.slice(0, 8)}`;
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Orders</h2>
                    <p className="text-muted-foreground">
                        Manage your order processing pipeline
                    </p>
                </div>
                <Link href="/dashboard/orders/new">
                    <Button>
                        <span className="mr-2">+</span>
                        New Order
                    </Button>
                </Link>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Filter:</span>
                <Button
                    variant={statusFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                >
                    All
                </Button>
                <Button
                    variant={statusFilter === "pending_review" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("pending_review")}
                >
                    Pending Review
                </Button>
                <Button
                    variant={statusFilter === "approved" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("approved")}
                >
                    Approved
                </Button>
                <Button
                    variant={statusFilter === "exported" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter("exported")}
                >
                    Exported
                </Button>
            </div>

            {/* Orders Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Recent Orders</CardTitle>
                </CardHeader>
                <CardContent>
                    {orders.length === 0 ? (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground mb-4">
                                No orders found. Create your first order to get started.
                            </p>
                            <Link href="/dashboard/orders/new">
                                <Button>Create Order</Button>
                            </Link>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Shop System</TableHead>
                                    <TableHead>Created</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {orders.map((order) => (
                                    <TableRow key={order.id}>
                                        <TableCell>
                                            {editingId === order.id ? (
                                                <Input
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onBlur={() => handleSaveRename(order.id)}
                                                    onKeyDown={(e) => handleKeyDown(e, order.id)}
                                                    autoFocus
                                                    className="h-8 w-48"
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2 group">
                                                    <span className="font-medium">
                                                        {getOrderDisplayName(order)}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleStartRename(order)}
                                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {getStatusBadge(order.status)}
                                        </TableCell>
                                        <TableCell>
                                            {getShopSystemBadge(order.shop_system)}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(order.created_at).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Link href={`/dashboard/orders/${order.id}`}>
                                                    <Button variant="outline" size="sm">
                                                        View
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(order.id)}
                                                    className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

