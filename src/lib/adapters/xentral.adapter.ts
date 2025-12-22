/**
 * Xentral ERP Adapter
 * Implements ShopAdapter interface for Xentral integration.
 */

import type { NormalizedProduct } from '@/types';
import type {
    ShopAdapter,
    ShopAdapterConfig,
    BatchUploadResult,
    UploadResult,
    ConnectionTestResult
} from './adapter.interface';

export class XentralAdapter implements ShopAdapter {
    readonly name = 'Xentral ERP';
    readonly system = 'xentral' as const;
    readonly isMock: boolean;

    private apiUrl: string;
    private apiKey: string;
    private timeout: number;

    constructor(config?: ShopAdapterConfig) {
        this.isMock = config?.mockMode ?? process.env.MOCK_EXTERNAL_APIS === 'true';
        this.apiUrl = config?.apiUrl ?? process.env.XENTRAL_API_URL ?? '';
        this.apiKey = config?.apiKey ?? process.env.XENTRAL_API_KEY ?? '';
        this.timeout = config?.timeout ?? 30000;
    }

    async uploadProducts(products: NormalizedProduct[]): Promise<BatchUploadResult> {
        if (this.isMock) {
            return this.mockUpload(products);
        }

        if (!this.apiUrl || !this.apiKey) {
            throw new Error('Xentral API credentials not configured');
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
        const response = await fetch(`${this.apiUrl}/api/artikel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(this.mapToXentralFormat(product)),
            signal: AbortSignal.timeout(this.timeout),
        });

        if (response.ok) {
            const data = await response.json();
            return {
                sku: String(product['sku'] || ''),
                status: 'success',
                externalId: data.id?.toString(),
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

    private mapToXentralFormat(product: NormalizedProduct): Record<string, unknown> {
        return {
            nummer: product['sku'],
            name_de: product['name'],
            name_en: product['name'],
            hersteller: product['brand'],
            herstellernummer: product['article_number'],
            ean: product['ean'],
            lagerbestand: product['quantity'],
            preis: product['price'],
            waehrung: product['currency'],
            kategorie: product['category'],
            eigenschaftwert1: product['color_normalized'] || product['color'], // Color
            eigenschaftwert2: product['size_normalized'] || product['size'],   // Size
            geschlecht: this.mapGender(product['gender'] as string | undefined),
        };
    }

    private mapGender(gender?: string): string {
        if (!gender) return 'unisex';
        const g = gender.toLowerCase();
        if (g.includes('women') || g.includes('female') || g.includes('damen')) return 'damen';
        if (g.includes('men') || g.includes('male') || g.includes('herren')) return 'herren';
        return 'unisex';
    }

    private async mockUpload(products: NormalizedProduct[]): Promise<BatchUploadResult> {
        console.log(`[MOCK Xentral] Uploading ${products.length} products`);

        await new Promise(resolve => setTimeout(resolve, 500));

        const results: UploadResult[] = products.map((p, index) => ({
            sku: String(p['sku'] || ''),
            status: 'success' as const,
            externalId: `XEN-${String(index + 1).padStart(6, '0')}`,
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
                shopInfo: { name: 'Mock Xentral ERP', version: '22.1' },
            };
        }

        if (!this.apiUrl || !this.apiKey) {
            return {
                connected: false,
                message: 'Xentral API credentials not configured',
            };
        }

        try {
            const response = await fetch(`${this.apiUrl}/api/VersionCheck`, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    connected: true,
                    shopInfo: { name: 'Xentral ERP', version: data.version },
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
            console.log(`[MOCK Xentral] Updating product ${externalId}`, updates);
            await new Promise(resolve => setTimeout(resolve, 200));
            return {
                sku: String(updates['sku'] || externalId),
                status: 'success',
                externalId,
                message: 'Mock update successful',
            };
        }

        const response = await fetch(`${this.apiUrl}/api/artikel/${externalId}`, {
            method: 'PUT',
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
 * Factory function to create a Xentral adapter
 */
export function createXentralAdapter(config?: ShopAdapterConfig): ShopAdapter {
    return new XentralAdapter(config);
}
