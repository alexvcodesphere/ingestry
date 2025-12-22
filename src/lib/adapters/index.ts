/**
 * Shop Adapter Registry
 * Factory for creating and managing shop system adapters.
 * Provides runtime selection of adapters based on ShopSystem type.
 */

import type { ShopSystem } from '@/types';
import type { ShopAdapter, ShopAdapterConfig } from './adapter.interface';
import { createShopwareAdapter } from './shopware.adapter';
import { createXentralAdapter } from './xentral.adapter';
import { createShopifyAdapter } from './shopify.adapter';

/**
 * Registry of adapter factory functions
 */
const adapterFactories: Record<ShopSystem, (config?: ShopAdapterConfig) => ShopAdapter> = {
    shopware: createShopwareAdapter,
    xentral: createXentralAdapter,
    shopify: createShopifyAdapter,
};

/**
 * Get a shop adapter instance for the specified system
 * @param system The shop system type
 * @param config Optional configuration overrides
 * @returns A configured ShopAdapter instance
 */
export function getAdapter(system: ShopSystem, config?: ShopAdapterConfig): ShopAdapter {
    const factory = adapterFactories[system];

    if (!factory) {
        throw new Error(`Unknown shop system: ${system}. Supported systems: ${getSupportedSystems().join(', ')}`);
    }

    return factory(config);
}

/**
 * Get list of all supported shop systems
 */
export function getSupportedSystems(): ShopSystem[] {
    return Object.keys(adapterFactories) as ShopSystem[];
}

/**
 * Get display information for all supported systems
 */
export function getSystemInfo(): Array<{ system: ShopSystem; name: string; available: boolean }> {
    return getSupportedSystems().map(system => {
        const adapter = getAdapter(system, { mockMode: true });
        return {
            system,
            name: adapter.name,
            available: !adapter.isMock || system === 'shopify', // Shopify is always mock for now
        };
    });
}

/**
 * Test connections to all configured shop systems
 */
export async function testAllConnections(): Promise<Map<ShopSystem, boolean>> {
    const results = new Map<ShopSystem, boolean>();

    for (const system of getSupportedSystems()) {
        try {
            const adapter = getAdapter(system);
            const result = await adapter.testConnection();
            results.set(system, result.connected);
        } catch {
            results.set(system, false);
        }
    }

    return results;
}

// Re-export types and individual adapters for direct use
export type { ShopAdapter, ShopAdapterConfig, UploadResult, BatchUploadResult, ConnectionTestResult } from './adapter.interface';
export { ShopwareAdapter, createShopwareAdapter } from './shopware.adapter';
export { XentralAdapter, createXentralAdapter } from './xentral.adapter';
export { ShopifyAdapter, createShopifyAdapter } from './shopify.adapter';
