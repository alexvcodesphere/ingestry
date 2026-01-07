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
import { IngestrySpark } from "@/components/orders/flow/IngestrySpark";
import { ExportDialog } from "@/components/orders/ExportDialog";
import type { DraftOrder, NormalizedProduct, DraftOrderStatus, DraftLineItem } from "@/types";
import type { DataRecord } from "@/lib/export";

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
        className: "bg-lime-100 text-lime-700 dark:bg-lime-900 dark:text-lime-300",
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
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    
    // Spark sidebar state
    const [sparkSelectedIds, setSparkSelectedIds] = useState<string[]>([]);
    const [sparkProcessing, setSparkProcessing] = useState(false);
    const [sparkOpen, setSparkOpen] = useState(false);
    
    // Regeneration visual feedback state
    const [regeneratingRowIds, setRegeneratingRowIds] = useState<Set<string>>(new Set());

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

    // Handle unapprove items
    const handleUnapproveItems = async (itemIds: string[]) => {
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "unapprove", lineItemIds: itemIds }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to unapprove items:", err);
        }
    };

    // Handle template field regeneration
    const handleRegenerateTemplates = async (itemIds: string[], fieldKeys?: string[]) => {
        // Set visual feedback
        setRegeneratingRowIds(new Set(itemIds));
        
        try {
            const response = await fetch(`/api/draft-orders/${orderId}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    action: "regenerate_templates", 
                    lineItemIds: itemIds,
                    fieldKeys: fieldKeys?.length ? fieldKeys : undefined,
                }),
            });

            const result = await response.json();
            if (result.success) {
                await fetchOrder();
            }
        } catch (err) {
            console.error("Failed to regenerate templates:", err);
        } finally {
            // Clear visual feedback
            setRegeneratingRowIds(new Set());
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
                    <Button
                        variant="outline"
                        onClick={() => setIsExportDialogOpen(true)}
                        disabled={!order.line_items || order.line_items.length === 0}
                    >
                        Export
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

            {/* Validation Grid + Spark Sidebar */}
            <div className="flex gap-4 items-stretch">
                <Card className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between border-b shrink-0">
                        <CardTitle className="text-base font-medium">Product Validation</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 flex-1 overflow-auto">
                        {order.line_items && order.line_items.length > 0 ? (
                            <DraftOrderGrid
                                lineItems={order.line_items}
                                orderId={orderId}
                                onUpdateItem={handleUpdateItem}
                                onApproveItems={handleApproveItems}
                                onUnapproveItems={handleUnapproveItems}
                                onApproveAll={handleApproveAll}
                                onRegenerateTemplates={handleRegenerateTemplates}
                                onBulkUpdate={handleBulkUpdate}
                                onRefreshData={fetchOrder}
                                isSubmitting={isSubmitting}
                                onSelectionChange={setSparkSelectedIds}
                                onSparkToggle={() => setSparkOpen(prev => !prev)}
                                regeneratingRowIds={regeneratingRowIds}
                                fieldLabels={
                                    ((order.metadata as { profile_fields?: Array<{ key: string; label: string }> })?.profile_fields || [])
                                        .reduce((acc, f) => ({ ...acc, [f.key]: f.label }), {} as Record<string, string>)
                                }
                                templatedFields={
                                    ((order.metadata as { profile_fields?: Array<{ key: string; use_template?: boolean; source?: string; logic_type?: string; template?: string; ai_prompt?: string }> })?.profile_fields || [])
                                        .filter(f => 
                                            // New pattern: computed field with template or AI enrichment logic
                                            (f.source === 'computed' && f.logic_type === 'template' && f.template) ||
                                            (f.source === 'computed' && f.logic_type === 'ai_enrichment' && f.ai_prompt) ||
                                            // Old pattern: use_template flag
                                            f.use_template
                                        )
                                        .map(f => f.key)
                                }
                                profileFields={
                                    (order.metadata as { profile_fields?: Array<{ key: string; source?: string; logic_type?: string }> })?.profile_fields as import("@/types").FieldDefinition[] ?? []
                                }
                                activeExportConfig={
                                    (order.metadata as { export_config?: import("@/types").ExportConfig })?.export_config
                                }
                            />
                        ) : (
                            <p className="text-center py-8 text-muted-foreground">
                                No items in this order
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Spark Sidebar */}
                <IngestrySpark
                    orderId={orderId}
                    selectedIds={sparkSelectedIds}
                    isOpen={sparkOpen}
                    onOpenChange={setSparkOpen}
                    onSparkComplete={(result) => {
                        // For operations without items data, refresh from server
                        if (!result.items || result.items.length === 0) {
                            fetchOrder();
                        }
                        // Clear any regenerating state
                        setRegeneratingRowIds(new Set());
                    }}
                    onProcessingChange={setSparkProcessing}
                    onRegeneratingChange={setRegeneratingRowIds}
                    onOptimisticUpdate={(items) => {
                        // OPTIMISTIC UPDATE: Immediately update grid without refetch
                        if (!order?.line_items) return;
                        
                        setOrder(prev => {
                            if (!prev?.line_items) return prev;
                            
                            const itemsMap = new Map(items.map(i => [i.id, i.data]));
                            const updatedLineItems = prev.line_items.map(li => {
                                const newData = itemsMap.get(li.id);
                                if (newData) {
                                    return {
                                        ...li,
                                        normalized_data: newData,
                                    };
                                }
                                return li;
                            });
                            
                            return {
                                ...prev,
                                line_items: updatedLineItems,
                            };
                        });
                    }}
                />
            </div>

            {/* Order Metadata */}
            <Card>
                <CardHeader className="border-b">
                    <CardTitle className="text-base font-medium">Order Details</CardTitle>
                </CardHeader>
                <CardContent className="p-6">
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
            {/* Export Dialog */}
            <ExportDialog
                open={isExportDialogOpen}
                onOpenChange={setIsExportDialogOpen}
                orderId={orderId}
                records={
                    (order.line_items || [])
                        .filter((item: DraftLineItem) => item.normalized_data)
                        .map((item: DraftLineItem) => item.normalized_data as DataRecord)
                }
            />
        </div>
    );
}
