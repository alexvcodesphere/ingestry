/**
 * Export Module
 * Modular export system for transforming and serializing data.
 * See /archive/EXPORT_ARCHITECTURE.md for full documentation.
 */

// Types
export type {
    DataRecord,
    FieldMapping,
    FormatOptions,
    OutputProfile,
    ExportResult,
} from './types';

// Field Mapper
export {
    mapRecord,
    mapRecords,
    getTargetFields,
} from './field-mapper';

// CSV Serializer
export {
    toCSV,
    getContentType as getCSVContentType,
    getFileExtension as getCSVFileExtension,
} from './csv-serializer';

// Export function
import type { DataRecord, OutputProfile, ExportResult } from './types';
import { mapRecords } from './field-mapper';
import { toCSV, getContentType, getFileExtension } from './csv-serializer';

/**
 * Export records using an Output Profile.
 * This is the main entry point for the export system.
 */
export function exportRecords(
    records: DataRecord[],
    profile: OutputProfile
): ExportResult {
    try {
        if (records.length === 0) {
            return {
                success: true,
                data: '',
                record_count: 0,
            };
        }

        // Step 1: Map fields using profile
        const mapped = mapRecords(records, profile);

        // Step 2: Serialize based on format
        let data: string;
        let content_type: string;
        let extension: string;

        if (profile.format === 'csv') {
            data = toCSV(mapped, profile.format_options);
            content_type = getContentType();
            extension = getFileExtension();
        } else if (profile.format === 'json') {
            data = JSON.stringify(mapped, null, 2);
            content_type = 'application/json';
            extension = 'json';
        } else {
            return {
                success: false,
                error: `Unsupported format: ${profile.format}`,
            };
        }

        // Generate filename
        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `export_${profile.name.toLowerCase().replace(/\s+/g, '_')}_${timestamp}.${extension}`;

        return {
            success: true,
            data,
            content_type,
            filename,
            record_count: records.length,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Export failed',
        };
    }
}
