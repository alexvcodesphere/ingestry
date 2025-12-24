/**
 * CSV Serializer
 * Converts data records to CSV format with configurable options.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

import type { DataRecord, FormatOptions } from './types';

/**
 * Default CSV options.
 */
const DEFAULTS: Required<Pick<FormatOptions, 'delimiter' | 'include_header'>> = {
    delimiter: ';',
    include_header: true,
};

/**
 * Escape a value for CSV output.
 * Wraps in quotes if contains delimiter, quotes, or newlines.
 */
function escapeValue(value: unknown, delimiter: string): string {
    if (value === undefined || value === null) return '';

    const str = String(value);

    // Check if quoting needed
    const needsQuotes =
        str.includes(delimiter) ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r');

    if (needsQuotes) {
        // Escape internal quotes by doubling them
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

/**
 * Get all unique keys from records in consistent order.
 */
function getAllKeys(records: DataRecord[], columnOrder?: string[]): string[] {
    if (columnOrder && columnOrder.length > 0) {
        return columnOrder;
    }

    // Collect all unique keys preserving first-seen order
    const keys = new Set<string>();
    for (const record of records) {
        for (const key of Object.keys(record)) {
            keys.add(key);
        }
    }
    return Array.from(keys);
}

/**
 * Convert a single record to a CSV row.
 */
function recordToRow(
    record: DataRecord,
    keys: string[],
    delimiter: string
): string {
    return keys
        .map(key => escapeValue(record[key], delimiter))
        .join(delimiter);
}

/**
 * Serialize records to CSV string.
 */
export function toCSV(
    records: DataRecord[],
    options: FormatOptions = {}
): string {
    if (records.length === 0) return '';

    const delimiter = options.delimiter ?? DEFAULTS.delimiter;
    const includeHeader = options.include_header ?? DEFAULTS.include_header;
    const keys = getAllKeys(records, options.column_order);

    const lines: string[] = [];

    // Add header row
    if (includeHeader) {
        lines.push(keys.join(delimiter));
    }

    // Add data rows
    for (const record of records) {
        lines.push(recordToRow(record, keys, delimiter));
    }

    // Use Windows line endings for maximum compatibility
    return lines.join('\r\n');
}

/**
 * Get the content type for CSV files.
 */
export function getContentType(): string {
    return 'text/csv; charset=utf-8';
}

/**
 * Get suggested file extension.
 */
export function getFileExtension(): string {
    return 'csv';
}
