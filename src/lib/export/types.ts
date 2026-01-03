/**
 * Export Types
 * Type definitions for the modular export system.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

// Re-export core types from global types
export type { FieldMapping, ExportConfig } from '@/types';

// Alias for backwards compatibility - use ExportConfig going forward
export type { ExportConfig as OutputProfile } from '@/types';

/**
 * Generic data record - fully dynamic, no hardcoded fields.
 * Used throughout the export layer.
 */
export type DataRecord = Record<string, unknown>;

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
