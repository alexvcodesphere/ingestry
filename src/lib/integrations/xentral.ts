import type { NormalizedProduct } from "@/types";

const MOCK_MODE = process.env.MOCK_EXTERNAL_APIS === "true";

export interface XentralUploadResult {
    sku: string;
    status: "success" | "error";
    message?: string;
    xentralId?: string;
}

/**
 * Upload products to Xentral ERP
 */
export async function uploadToXentral(
    products: NormalizedProduct[]
): Promise<XentralUploadResult[]> {
    if (MOCK_MODE) {
        console.log("[MOCK] Uploading to Xentral:", products.length, "products");

        // Simulate some delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        return products.map((p, index) => ({
            sku: p.sku,
            status: "success" as const,
            message: "Mocked upload successful",
            xentralId: `XEN-${String(index + 1).padStart(6, "0")}`,
        }));
    }

    // Real implementation
    const apiUrl = process.env.XENTRAL_API_URL;
    const apiKey = process.env.XENTRAL_API_KEY;

    if (!apiUrl || !apiKey) {
        throw new Error("Xentral API credentials not configured");
    }

    const results: XentralUploadResult[] = [];

    for (const product of products) {
        try {
            const response = await fetch(`${apiUrl}/artikel`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    nummer: product.sku,
                    name_de: product.name,
                    hersteller: product.brand,
                    // Add more fields as needed
                }),
            });

            if (response.ok) {
                const data = await response.json();
                results.push({
                    sku: product.sku,
                    status: "success",
                    xentralId: data.id,
                });
            } else {
                results.push({
                    sku: product.sku,
                    status: "error",
                    message: `HTTP ${response.status}`,
                });
            }
        } catch (error) {
            results.push({
                sku: product.sku,
                status: "error",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }

    return results;
}

/**
 * Update a product in Xentral
 */
export async function updateInXentral(
    xentralId: string,
    updates: Partial<NormalizedProduct>
): Promise<XentralUploadResult> {
    if (MOCK_MODE) {
        console.log("[MOCK] Updating in Xentral:", xentralId, updates);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return {
            sku: updates.sku || "",
            status: "success",
            message: "Mocked update successful",
            xentralId,
        };
    }

    // Real implementation would go here
    throw new Error("Real Xentral update not implemented yet");
}
