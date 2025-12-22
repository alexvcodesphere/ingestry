/**
 * Shop System Adapter Interface
 * Common interface for all e-commerce platform integrations.
 * Allows for mock implementations during development and easy addition of new platforms.
 */

import type { NormalizedProduct, ShopSystem } from '@/types';

/**
 * Result of a single product upload attempt
 */
export interface UploadResult {
    sku: string;
    status: 'success' | 'error';
    externalId?: string;
    message?: string;
}

/**
 * Batch upload result with summary
 */
export interface BatchUploadResult {
    successful: number;
    failed: number;
    results: UploadResult[];
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
    connected: boolean;
    message?: string;
    shopInfo?: {
        name: string;
        version?: string;
    };
}

/**
 * Shop Adapter Interface
 * All shop system integrations must implement this interface.
 */
export interface ShopAdapter {
    /** Display name of the shop system */
    readonly name: string;

    /** Shop system type identifier */
    readonly system: ShopSystem;

    /** Whether this adapter is running in mock mode */
    readonly isMock: boolean;

    /**
     * Upload a batch of products to the shop system
     * @param products Normalized products to upload
     * @returns Results for each product upload attempt
     */
    uploadProducts(products: NormalizedProduct[]): Promise<BatchUploadResult>;

    /**
     * Test the connection to the shop system
     * @returns Connection status and optional shop info
     */
    testConnection(): Promise<ConnectionTestResult>;

    /**
     * Update an existing product in the shop system
     * @param externalId The ID of the product in the external system
     * @param updates Partial product data to update
     */
    updateProduct?(externalId: string, updates: Partial<NormalizedProduct>): Promise<UploadResult>;

    /**
     * Delete a product from the shop system
     * @param externalId The ID of the product in the external system
     */
    deleteProduct?(externalId: string): Promise<UploadResult>;
}

/**
 * Base configuration for shop adapters
 */
export interface ShopAdapterConfig {
    apiUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    mockMode?: boolean;
    timeout?: number;
}

/**
 * Factory function type for creating shop adapters
 */
export type ShopAdapterFactory = (config?: ShopAdapterConfig) => ShopAdapter;
