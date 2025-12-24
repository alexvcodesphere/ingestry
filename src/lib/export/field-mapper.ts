/**
 * Field Mapper
 * Transforms data records using Output Profile field mappings.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

import type { DataRecord, FieldMapping, OutputProfile } from './types';

/**
 * Evaluate a template string with {variable} placeholders.
 * Supports simple variable substitution only.
 */
function evaluateTemplate(template: string, record: DataRecord): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        const value = record[key];
        return value !== undefined && value !== null ? String(value) : '';
    });
}

/**
 * Get a value from a record, returning empty string for null/undefined.
 */
function getValue(record: DataRecord, key: string): string {
    const value = record[key];
    if (value === undefined || value === null) return '';
    return String(value);
}

/**
 * Apply a single field mapping to a record.
 * Returns the target key and computed value.
 */
function applyMapping(
    record: DataRecord,
    mapping: FieldMapping
): { key: string; value: string } {
    let value: string;

    if (mapping.template) {
        // Use template evaluation
        value = evaluateTemplate(mapping.template, record);
    } else {
        // Direct field mapping
        value = getValue(record, mapping.source);
    }

    // Apply default if empty
    if (!value && mapping.default_value) {
        value = mapping.default_value;
    }

    return { key: mapping.target, value };
}

/**
 * Map a single record using field mappings.
 * Returns a new record with target field names.
 */
export function mapRecord(
    record: DataRecord,
    mappings: FieldMapping[]
): DataRecord {
    const result: DataRecord = {};

    for (const mapping of mappings) {
        const { key, value } = applyMapping(record, mapping);
        result[key] = value;
    }

    return result;
}

/**
 * Map multiple records using an Output Profile.
 * Returns new records with target field names ready for serialization.
 */
export function mapRecords(
    records: DataRecord[],
    profile: OutputProfile
): DataRecord[] {
    return records.map(record => mapRecord(record, profile.field_mappings));
}

/**
 * Get all unique target field names from mappings.
 * Useful for generating CSV headers.
 */
export function getTargetFields(mappings: FieldMapping[]): string[] {
    const fields = new Set<string>();
    for (const mapping of mappings) {
        fields.add(mapping.target);
    }
    return Array.from(fields);
}
