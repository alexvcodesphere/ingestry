/**
 * Shopware Shop Adapter
 * Implements ShopAdapter interface for Shopware 6 integration.
 */

import type { NormalizedProduct } from '@/types';
import type {
    ShopAdapter,
    ShopAdapterConfig,
    BatchUploadResult,
    UploadResult,
    ConnectionTestResult
} from './adapter.interface';

export class ShopwareAdapter implements ShopAdapter {
    readonly name = 'Shopware 6';
    readonly system = 'shopware' as const;
    readonly isMock: boolean;

    private apiUrl: string;
    private apiKey: string;
    private timeout: number;

    constructor(config?: ShopAdapterConfig) {
        this.isMock = config?.mockMode ?? process.env.MOCK_EXTERNAL_APIS === 'true';
        this.apiUrl = config?.apiUrl ?? process.env.SHOPWARE_API_URL ?? '';
        this.apiKey = config?.apiKey ?? process.env.SHOPWARE_API_KEY ?? '';
        this.timeout = config?.timeout ?? 30000;
    }

    async uploadProducts(products: NormalizedProduct[]): Promise<BatchUploadResult> {
        if (this.isMock) {
            return this.mockUpload(products);
        }

        if (!this.apiUrl || !this.apiKey) {
            throw new Error('Shopware API credentials not configured');
        }

        const results: UploadResult[] = [];
        let successful = 0;
        let failed = 0;

        for (const product of products) {
            try {
                const result = await this.uploadSingleProduct(product);
                results.push(result);
                if (result.status === 'success') {
                    successful++;
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                results.push({
                    sku: String(product['sku'] || ''),
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }

        return { successful, failed, results };
    }

    private async uploadSingleProduct(product: NormalizedProduct): Promise<UploadResult> {
        const response = await fetch(`${this.apiUrl}/api/product`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(this.mapToShopwareFormat(product)),
            signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
            const data = await response.json();
            return {
                sku: String(product['sku'] || ''),
                status: 'success',
                externalId: data.data?.id || data.id,
            };
        } else {
            const error = await response.text();
            return {
                sku: String(product['sku'] || ''),
                status: 'error',
                message: `HTTP ${response.status}: ${error}`,
            };
        }
    }

    private mapToShopwareFormat(product: NormalizedProduct): Record<string, unknown> {
        return {
            productNumber: product['sku'],
            name: product['name'],
            stock: product['quantity'],
            price: [{
                currencyId: this.getCurrencyId(String(product['currency'] || 'EUR')),
                gross: Number(product['price'] || 0),
                net: Number(product['price'] || 0) / 1.19, // Assuming 19% VAT
                linked: true,
            }],
            manufacturer: {
                name: product['brand'],
            },
            categories: product['category'] ? [{
                name: product['category'],
            }] : undefined,
            customFields: {
                ean: product['ean'],
                color: product['color_normalized'] || product['color'],
                size: product['size_normalized'] || product['size'],
            },
        };
    }

    private getCurrencyId(currency: string): string {
        // Default currency IDs for common currencies
        const currencyMap: Record<string, string> = {
            'EUR': 'b7d2554b0ce847cd82f3ac9bd1c0dfca',
            'USD': 'b7d2554b0ce847cd82f3ac9bd1c0dfcb',
            'GBP': 'b7d2554b0ce847cd82f3ac9bd1c0dfcc',
        };
        return currencyMap[currency] || currencyMap['EUR'];
    }

    private async mockUpload(products: NormalizedProduct[]): Promise<BatchUploadResult> {
        console.log(`[MOCK Shopware] Uploading ${products.length} products`);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        const results: UploadResult[] = products.map((p, index) => ({
            sku: String(p['sku'] || ''),
            status: 'success' as const,
            externalId: `SW-${String(index + 1).padStart(8, '0')}`,
            message: 'Mock upload successful',
        }));

        return {
            successful: products.length,
            failed: 0,
            results,
        };
    }

    async testConnection(): Promise<ConnectionTestResult> {
        if (this.isMock) {
            return {
                connected: true,
                message: 'Mock mode - connection simulated',
                shopInfo: { name: 'Mock Shopware Store', version: '6.5.0' },
            };
        }

        if (!this.apiUrl || !this.apiKey) {
            return {
                connected: false,
                message: 'Shopware API credentials not configured',
            };
        }

        try {
            const response = await fetch(`${this.apiUrl}/api/_info/version`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    connected: true,
                    shopInfo: { name: 'Shopware', version: data.version },
                };
            } else {
                return {
                    connected: false,
                    message: `HTTP ${response.status}`,
                };
            }
        } catch (error) {
            return {
                connected: false,
                message: error instanceof Error ? error.message : 'Connection failed',
            };
        }
    }

    async updateProduct(externalId: string, updates: Partial<NormalizedProduct>): Promise<UploadResult> {
        if (this.isMock) {
            console.log(`[MOCK Shopware] Updating product ${externalId}`, updates);
            await new Promise(resolve => setTimeout(resolve, 200));
            return {
                sku: String(updates['sku'] || externalId),
                status: 'success',
                externalId,
                message: 'Mock update successful',
            };
        }

        const response = await fetch(`${this.apiUrl}/api/product/${externalId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(updates),
            signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
            return {
                sku: String(updates['sku'] || externalId),
                status: 'success',
                externalId,
            };
        } else {
            return {
                sku: String(updates['sku'] || externalId),
                status: 'error',
                message: `HTTP ${response.status}`,
            };
        }
    }
}

/**
 * Factory function to create a Shopware adapter
 */
export function createShopwareAdapter(config?: ShopAdapterConfig): ShopAdapter {
    return new ShopwareAdapter(config);
}
