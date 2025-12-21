import type { Product } from "@/types";

const MOCK_MODE = process.env.MOCK_EXTERNAL_APIS === "true";

export interface ShopwareUploadResult {
    sku: string;
    status: "success" | "error";
    message?: string;
    shopwareId?: string;
}

/**
 * Upload products to Shopware
 */
export async function uploadToShopware(
    products: Product[]
): Promise<ShopwareUploadResult[]> {
    if (MOCK_MODE) {
        console.log("[MOCK] Uploading to Shopware:", products.length, "products");

        // Simulate some delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        return products.map((p, index) => ({
            sku: p.sku,
            status: "success" as const,
            message: "Mocked upload successful",
            shopwareId: `SW-${String(index + 1).padStart(6, "0")}`,
        }));
    }

    // Real implementation
    const apiUrl = process.env.SHOPWARE_API_URL;
    const apiKey = process.env.SHOPWARE_API_KEY;

    if (!apiUrl || !apiKey) {
        throw new Error("Shopware API credentials not configured");
    }

    const results: ShopwareUploadResult[] = [];

    for (const product of products) {
        try {
            const response = await fetch(`${apiUrl}/product`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    productNumber: product.sku,
                    name: product.name,
                    manufacturer: product.brand,
                    // Add more fields as needed
                }),
            });

            if (response.ok) {
                const data = await response.json();
                results.push({
                    sku: product.sku,
                    status: "success",
                    shopwareId: data.id,
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
