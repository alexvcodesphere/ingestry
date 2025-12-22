"use client";

/**
 * Order Detail Page
 * Displays a single draft order with validation grid for human-in-the-loop review.
 */

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DraftOrderGrid } from "@/components/orders/flow/DraftOrderGrid";
import type { DraftOrder, NormalizedProduct, DraftOrderStatus } from "@/types";

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
        label: "All Approved",
        className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    exporting: {
        label: "Exporting...",
        className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
    exported: {
        label: "Exported",
        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    },
    failed: {
        label: "Export Failed",
        className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
};

export default function OrderDetailPage() {
    const params = useParams();
    const router = useRouter();
    const orderId = params.id as string;

    const [order, setOrder] = useState<DraftOrder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

    // Fetch order data
    const fetchOrder = useCallback(async () => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}`);
            const result = await response.json();

            if (result.success) {
                setOrder(result.data);
            } else {
                setError(result.error || "Failed to load order");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load order");
        } finally {
            setIsLoading(false);
        }
    }, [orderId]);

    useEffect(() => {
        fetchOrder();
    }, [fetchOrder]);

    // Handle line item update
    const handleUpdateItem = async (itemId: string, updates: Partial<NormalizedProduct>) => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lineItemId: itemId, updates }),
            });

            const result = await response.json();
            if (result.success) {
                // Refresh order data
                await fetchOrder();
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            console.error("Failed to update item:", err);
            throw err;
        }
    };

    // Handle approve items
    const handleApproveItems = async (itemIds: string[]) => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve", lineItemIds: itemIds }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to approve items:", err);
        }
    };

    // Handle approve all
    const handleApproveAll = async () => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve_all" }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to approve all:", err);
        }
    };

    // Handle SKU regeneration
    const handleRegenerateSku = async (itemIds: string[]) => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "regenerate_sku", lineItemIds: itemIds }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to regenerate SKUs:", err);
        }
    };

    // Handle bulk update
    const handleBulkUpdate = async (itemIds: string[], updates: Partial<NormalizedProduct>) => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lineItemIds: itemIds, updates }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to bulk update:", err);
        }
    };

    // Handle submit to shop
    const handleSubmitToShop = async () => {
        setIsSubmitting(true);
        setSubmitResult(null);

        try {
            const response = await fetch(`/api/draft-orders/${orderId}/submit`, {
                method: "POST",
            });

            const result = await response.json();

            if (result.success) {
                setSubmitResult({
                    success: true,
                    message: "Order submitted successfully!",
                });
                await fetchOrder();
            } else {
                setSubmitResult({
                    success: false,
                    message: result.error || "Submission failed",
                });
            }
        } catch (err) {
            setSubmitResult({
                success: false,
                message: err instanceof Error ? err.message : "Submission failed",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="text-center py-12">
                <p className="text-red-500 mb-4">{error || "Order not found"}</p>
                <Button variant="outline" onClick={() => router.push("/dashboard/orders")}>
                    Back to Orders
                </Button>
            </div>
        );
    }

    const statusCfg = statusConfig[order.status] || statusConfig.processing;
    const canSubmit = order.status === "approved";
    const isExported = order.status === "exported";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold tracking-tight">
                            Order {order.id.slice(0, 8)}
                        </h2>
                        <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusCfg.className}`}
                        >
                            {statusCfg.label}
                        </span>
                    </div>
                    <p className="text-muted-foreground">
                        {order.source_file_name || "Uploaded file"} • {order.shop_system} •{" "}
                        {new Date(order.created_at).toLocaleString()}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/dashboard/orders")}
                    >
                        Back
                    </Button>
                    {!isExported && (
                        <Button
                            onClick={handleSubmitToShop}
                            disabled={!canSubmit || isSubmitting}
                        >
                            {isSubmitting ? "Submitting..." : "Submit to Shop"}
                        </Button>
                    )}
                </div>
            </div>

            {/* Submit Result Message */}
            {submitResult && (
                <div
                    className={`p-4 rounded-lg ${submitResult.success
                        ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                        }`}
                >
                    {submitResult.message}
                </div>
            )}

            {/* Validation Grid */}
            <Card>
                <CardHeader>
                    <CardTitle>Product Validation</CardTitle>
                    <CardDescription>
                        Review and edit extracted products. Click on cells to edit values.
                        Approve items when they are correct.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {order.line_items && order.line_items.length > 0 ? (
                        <DraftOrderGrid
                            lineItems={order.line_items}
                            onUpdateItem={handleUpdateItem}
                            onApproveItems={handleApproveItems}
                            onApproveAll={handleApproveAll}
                            onRegenerateSku={handleRegenerateSku}
                            onBulkUpdate={handleBulkUpdate}
                            isSubmitting={isSubmitting}
                        />
                    ) : (
                        <p className="text-center py-8 text-muted-foreground">
                            No items in this order
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Order Metadata */}
            <Card>
                <CardHeader>
                    <CardTitle>Order Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt className="text-muted-foreground">Order ID</dt>
                            <dd className="font-mono">{order.id}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Shop System</dt>
                            <dd className="capitalize">{order.shop_system}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Created</dt>
                            <dd>{new Date(order.created_at).toLocaleString()}</dd>
                        </div>
                        <div>
                            <dt className="text-muted-foreground">Last Updated</dt>
                            <dd>{new Date(order.updated_at).toLocaleString()}</dd>
                        </div>
                        {(order.metadata as { profile_name?: string })?.profile_name && (
                            <div>
                                <dt className="text-muted-foreground">Processing Profile</dt>
                                <dd>{(order.metadata as { profile_name?: string }).profile_name}</dd>
                            </div>
                        )}
                    </dl>
                </CardContent>
            </Card>
        </div>
    );
}
