/**
 * CSV Parser Utility
 * Parses CSV content with automatic delimiter detection.
 */

export interface ParsedCSV {
    headers: string[];
    rows: Record<string, string>[];
}

export interface ParseOptions {
    delimiter?: string;
}

/**
 * Auto-detect the delimiter used in CSV content.
 * Checks for semicolon, comma, and tab in the first line.
 */
function detectDelimiter(content: string): string {
    const firstLine = content.split('\n')[0] || '';
    
    // Count occurrences of common delimiters in first line
    const counts: Record<string, number> = {
        ';': (firstLine.match(/;/g) || []).length,
        ',': (firstLine.match(/,/g) || []).length,
        '\t': (firstLine.match(/\t/g) || []).length,
    };
    
    // Return the most common one (prefer semicolon as tiebreaker since it's our export default)
    if (counts[';'] >= counts[','] && counts[';'] >= counts['\t']) return ';';
    if (counts[','] >= counts['\t']) return ',';
    return '\t';
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++;
                } else {
                    // End of quoted field
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === delimiter) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }
    
    // Push last field
    result.push(current.trim());
    
    return result;
}

/**
 * Parse CSV content into headers and rows.
 */
export function parseCSV(content: string, options?: ParseOptions): ParsedCSV {
    const delimiter = options?.delimiter || detectDelimiter(content);
    
    // Normalize line endings and split
    const lines = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .filter(line => line.trim().length > 0);
    
    if (lines.length === 0) {
        return { headers: [], rows: [] };
    }
    
    // First line is headers
    const headers = parseLine(lines[0], delimiter);
    
    // Parse data rows
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseLine(lines[i], delimiter);
        const row: Record<string, string> = {};
        
        headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
        });
        
        rows.push(row);
    }
    
    return { headers, rows };
}

/**
 * Validate CSV headers against expected columns.
 * Returns extra headers not in the known set.
 */
export function findExtraHeaders(
    headers: string[],
    knownHeaders: string[]
): string[] {
    const knownSet = new Set(knownHeaders.map(h => h.toLowerCase()));
    return headers.filter(h => !knownSet.has(h.toLowerCase()));
}
