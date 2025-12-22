/**
 * Shopify Adapter
 * Mock implementation of ShopAdapter interface for Shopify.
 * Real integration to be added when needed.
 */

import type { NormalizedProduct } from '@/types';
import type {
    ShopAdapter,
    ShopAdapterConfig,
    BatchUploadResult,
    UploadResult,
    ConnectionTestResult
} from './adapter.interface';

export class ShopifyAdapter implements ShopAdapter {
    readonly name = 'Shopify';
    readonly system = 'shopify' as const;
    readonly isMock = true; // Always mock for now

    private shopDomain: string;
    private accessToken: string;

    constructor(config?: ShopAdapterConfig) {
        this.shopDomain = config?.apiUrl ?? process.env.SHOPIFY_SHOP_DOMAIN ?? '';
        this.accessToken = config?.apiKey ?? process.env.SHOPIFY_ACCESS_TOKEN ?? '';
    }

    async uploadProducts(products: NormalizedProduct[]): Promise<BatchUploadResult> {
        console.log(`[MOCK Shopify] Uploading ${products.length} products to ${this.shopDomain || 'mock-store'}`);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        const results: UploadResult[] = products.map((p, index) => ({
            sku: p.sku,
            status: 'success' as const,
            externalId: `gid://shopify/Product/${1000000000 + index}`,
            message: 'Mock upload successful',
        }));

        return {
            successful: products.length,
            failed: 0,
            results,
        };
    }

    async testConnection(): Promise<ConnectionTestResult> {
        // Always return mock success
        return {
            connected: true,
            message: 'Mock mode - Shopify integration not yet implemented',
            shopInfo: {
                name: this.shopDomain || 'Mock Shopify Store',
                version: '2024-01',
            },
        };
    }

    async updateProduct(externalId: string, updates: Partial<NormalizedProduct>): Promise<UploadResult> {
        console.log(`[MOCK Shopify] Updating product ${externalId}`, updates);
        await new Promise(resolve => setTimeout(resolve, 200));

        return {
            sku: updates.sku || externalId,
            status: 'success',
            externalId,
            message: 'Mock update successful',
        };
    }

    async deleteProduct(externalId: string): Promise<UploadResult> {
        console.log(`[MOCK Shopify] Deleting product ${externalId}`);
        await new Promise(resolve => setTimeout(resolve, 200));

        return {
            sku: externalId,
            status: 'success',
            externalId,
            message: 'Mock delete successful',
        };
    }
}

/**
 * Factory function to create a Shopify adapter
 */
export function createShopifyAdapter(config?: ShopAdapterConfig): ShopAdapter {
    return new ShopifyAdapter(config);
}
