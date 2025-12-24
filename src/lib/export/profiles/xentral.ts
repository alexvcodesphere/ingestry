/**
 * Xentral CSV Output Profile Seed
 * Pre-built output profile for Xentral ERP CSV import format.
 * Users can clone and customize this for their specific Xentral configuration.
 */

import type { OutputProfile, FieldMapping } from '../types';

/**
 * Default field mappings for Xentral CSV format.
 * Based on the sample CSV structure in /archive/18561.csv
 */
export const XENTRAL_FIELD_MAPPINGS: FieldMapping[] = [
    // Core identifiers
    { source: 'sku', target: 'number' },
    { source: 'ean', target: 'ean' },

    // Product names (both languages)
    { source: 'name', target: 'name_de' },
    { source: 'name', target: 'name_en' },

    // Meta titles with template
    { source: 'name', target: 'metatitle_de', template: '{brand} - {name} - {sku}' },
    { source: 'name', target: 'metatitle_en', template: '{brand} - {name} - {sku}' },

    // Descriptions (placeholder)
    { source: 'description', target: 'artikelbeschreibung_de', default_value: 'Description coming soon' },
    { source: 'description', target: 'item_description_en', default_value: 'Description coming soon' },

    // Brand/Manufacturer
    { source: 'brand', target: 'hersteller' },
    { source: 'brand', target: 'manufacturer' },

    // Supplier info
    { source: 'article_number', target: 'supplier order number' },
    { source: 'supplier', target: 'supplier name' },

    // Category
    { source: 'category', target: 'article_category_name' },

    // Pricing
    { source: 'price', target: 'sale_price1net' },

    // Attributes
    { source: 'color', target: 'colour' },
    { source: 'color', target: 'BaseColor' },
    { source: 'size', target: 'additionalText' },

    // Custom fields (Xentral freefields)
    { source: 'gender', target: 'custom_field_3' },
    { source: 'season', target: 'custom_field_4' },
    { source: 'material', target: 'custom_field_7' },
    { source: 'country_of_origin', target: 'country of origin' },
];

/**
 * Complete Xentral CSV output profile.
 * This can be inserted as a seed profile for new tenants.
 */
export const XENTRAL_CSV_PROFILE: Omit<OutputProfile, 'id' | 'tenant_id' | 'created_at'> = {
    name: 'Xentral CSV',
    description: 'CSV export format for Xentral ERP import',
    field_mappings: XENTRAL_FIELD_MAPPINGS,
    format: 'csv',
    format_options: {
        delimiter: ';',
        include_header: true,
    },
    is_default: true,
};

/**
 * Get the Xentral seed profile for a specific tenant.
 */
export function createXentralProfile(tenantId: string): Omit<OutputProfile, 'id' | 'created_at'> {
    return {
        ...XENTRAL_CSV_PROFILE,
        tenant_id: tenantId,
    };
}
