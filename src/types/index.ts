// Database types for Supabase

export interface Supplier {
    id: string;
    brand_name: string;
    supplier_name: string;
    brand_code: string;
    created_at?: string;
}

export interface Category {
    id: string;
    code: string;
    name: string;
    article_tree: string[];
    created_at?: string;
}

export interface Color {
    id: string;
    canonical_name: string;
    code: string;
    aliases: string[];
    created_at?: string;
}

export interface Catalogue {
    id: string;
    name: string;
    headers: string[];
    file_path: string;
    created_at: string;
}

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

// Product types
export interface Product {
    sku: string;
    ean?: string;
    product_code?: string;
    supplier: string;
    gender: string;
    season: string;
    brand: string;
    name: string;
    original_price: string;
    sell_price: string;
    color: string;
    size: string;
    quantity: string;
}

export interface ExtractedProduct {
    identifiers: string[];
    quantity?: string;
    size?: string;
    color?: string;
    price?: string;
    name?: string;
    raw_text?: string;
}

// API response types
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
