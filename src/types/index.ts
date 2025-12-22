// Database types for Supabase

// ============================================
// Job Types
// ============================================

export type JobType = 'pdf_extraction' | 'shopware_upload' | 'xentral_upload' | 'sku_regeneration';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
    id: string;
    type: JobType;
    status: JobStatus;
    input: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
    user_id: string;
    created_at: string;
    updated_at?: string;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// ============================================
// Shop System Types
// ============================================

export type ShopSystem = 'shopify' | 'shopware' | 'xentral';

export interface MappingTemplate {
    id: string;
    name: string;
    shop_system: ShopSystem;
    category_rules: CategoryRule[];
    field_mappings: Record<string, string>;
    created_at?: string;
}

export interface CategoryRule {
    keywords: string[];
    category: string;
    gender?: string;
}

// ============================================
// Draft Order Types (Processing Pipeline)
// ============================================

export type DraftOrderStatus =
    | 'processing'      // GPT extraction in progress
    | 'pending_review'  // Ready for human validation
    | 'approved'        // All items approved
    | 'exporting'       // Pushing to shop system
    | 'exported'        // Successfully exported
    | 'failed';         // Export failed

export type LineItemStatus =
    | 'pending'     // Awaiting review
    | 'validated'   // Auto-validated, no issues
    | 'error'       // Has validation errors
    | 'approved';   // Manually approved

export interface DraftOrder {
    id: string;
    status: DraftOrderStatus;
    shop_system: ShopSystem;
    template_id?: string;
    source_file_name?: string;
    source_job_id?: string;
    user_id: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    // Joined relations
    line_items?: DraftLineItem[];
}

export interface DraftLineItem {
    id: string;
    draft_order_id: string;
    line_number: number;
    status: LineItemStatus;
    raw_data: RawExtractedProduct;
    normalized_data?: NormalizedProduct;
    validation_errors: ValidationError[];
    user_modified: boolean;
    created_at: string;
    updated_at: string;
}

/** Raw product data from GPT Vision extraction - dynamic based on profile */
export type RawExtractedProduct = Record<string, string>;

export interface ValidationError {
    field: string;
    message: string;
    severity: 'warning' | 'error';
}

/**
 * Normalized product ready for shop export.
 * Fields are dynamic based on processing profile - no hardcoded structure.
 * Common fields include: sku, name, brand, color, size, price, quantity
 * but any field defined in the profile can be present.
 */
export type NormalizedProduct = Record<string, unknown>;

// ============================================
// Processing Context
// ============================================

export interface ProcessingContext {
    shop_system: ShopSystem;
    template?: MappingTemplate;
    brand_name?: string;
    user_id: string;
    source_job_id?: string;
    extraction_profile_id?: string;
    sku_template_id?: string;
    options?: {
        auto_generate_sku: boolean;
        normalize_colors: boolean;
        match_catalogue: boolean;
    };
}

// ============================================
// Configuration Types
// ============================================

export interface FieldDefinition {
    key: string;
    label: string;
    type: 'text' | 'number' | 'currency' | 'enum';
    required: boolean;
    instructions?: string;
    enumValues?: string[];
    defaultValue?: string;
}

export interface ExtractionProfile {
    id: string;
    name: string;
    description?: string;
    fields: FieldDefinition[];
    prompt_additions?: string;
    is_default: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface SkuTemplate {
    id: string;
    name: string;
    template: string;
    description?: string;
    is_default: boolean;
    created_at?: string;
    updated_at?: string;
}

// ============================================
// Code Lookups (Dynamic Lookup Types)
// ============================================

export interface CodeLookup {
    id: string;
    field_key: string;  // Dynamic: brand, category, color, gender, + custom types
    name: string;
    code: string;
    aliases?: string[];
    sort_order?: number;
    tenant_id?: string;
    created_at?: string;
}

// Processing profile type for database
export interface ProcessingProfile {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    fields: FieldDefinition[];
    prompt_additions?: string;
    sku_template?: string;
    generate_sku: boolean;
    is_default: boolean;
    created_at?: string;
    updated_at?: string;
}
