/**
 * Export Types
 * Type definitions for the modular export system.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

/**
 * Generic data record - fully dynamic, no hardcoded fields.
 * Used throughout the export layer.
 */
export type DataRecord = Record<string, unknown>;

/**
 * Field mapping configuration.
 * Maps source field names to target field names with optional templates.
 */
export interface FieldMapping {
    /** Key from processed data (e.g., "brand") */
    source: string;
    /** Key in output format (e.g., "hersteller") */
    target: string;
    /** Optional template using {variable} syntax (e.g., "{brand} - {name}") */
    template?: string;
    /** Fallback value if source is empty */
    default_value?: string;
}

/**
 * Format-specific options for serialization.
 */
export interface FormatOptions {
    /** CSV delimiter character (default: ";") */
    delimiter?: string;
    /** Whether to include header row (default: true) */
    include_header?: boolean;
    /** Explicit column ordering for CSV output */
    column_order?: string[];
}

/**
 * Output Profile configuration.
 * Defines how to map and format data for export to external systems.
 */
export interface OutputProfile {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    /** Field mappings from internal to external format */
    field_mappings: FieldMapping[];
    /** Output format type */
    format: 'csv' | 'json';
    /** Format-specific options */
    format_options: FormatOptions;
    /** Whether this is the default profile for the tenant */
    is_default: boolean;
    created_at?: string;
}

/**
 * Result of an export operation.
 */
export interface ExportResult {
    success: boolean;
    /** Serialized data (CSV string, JSON string, etc.) */
    data?: string;
    /** Content type for HTTP response */
    content_type?: string;
    /** Suggested filename for download */
    filename?: string;
    /** Error message if failed */
    error?: string;
    /** Number of records exported */
    record_count?: number;
}
