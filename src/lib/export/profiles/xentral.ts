/**
 * Xentral CSV Export Config Template
 * Pre-built export configuration for Xentral ERP CSV import format.
 * This can be used as a starting point for creating Xentral export configs.
 */

import type { FieldMapping, ExportConfig } from '@/types';

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
 * Complete Xentral CSV export config template.
 * Use this as a starting point when adding export configs to a processing profile.
 */
export function createXentralExportConfig(id: string = 'xentral-csv'): ExportConfig {
    return {
        id,
        name: 'Xentral CSV',
        shop_system: 'xentral',
        field_mappings: XENTRAL_FIELD_MAPPINGS,
        format: 'csv',
        format_options: {
            delimiter: ';',
            include_header: true,
        },
        is_default: true,
    };
}
