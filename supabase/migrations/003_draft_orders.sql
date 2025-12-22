-- Supabase SQL Migration: Draft Orders
-- Run this in the Supabase SQL Editor

-- Draft orders table for tracking order processing state
CREATE TABLE IF NOT EXISTS draft_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'processing' 
        CHECK (status IN ('processing', 'pending_review', 'approved', 'exporting', 'exported', 'failed')),
    shop_system TEXT NOT NULL 
        CHECK (shop_system IN ('shopify', 'shopware', 'xentral')),
    template_id UUID,
    brand_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    source_file_name TEXT,
    source_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Draft line items table for individual product lines
CREATE TABLE IF NOT EXISTS draft_line_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    draft_order_id UUID NOT NULL REFERENCES draft_orders(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'validated', 'error', 'approved')),
    raw_data JSONB NOT NULL,
    normalized_data JSONB,
    validation_errors JSONB DEFAULT '[]',
    user_modified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure unique line numbers within an order
    UNIQUE(draft_order_id, line_number)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_draft_orders_user_id ON draft_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_orders_status ON draft_orders(status);
CREATE INDEX IF NOT EXISTS idx_draft_orders_created_at ON draft_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_line_items_order_id ON draft_line_items(draft_order_id);
CREATE INDEX IF NOT EXISTS idx_draft_line_items_status ON draft_line_items(status);

-- Enable Row Level Security
ALTER TABLE draft_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for draft_orders
CREATE POLICY "Users can read own draft orders" 
    ON draft_orders FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own draft orders" 
    ON draft_orders FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own draft orders" 
    ON draft_orders FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own draft orders" 
    ON draft_orders FOR DELETE TO authenticated 
    USING (auth.uid() = user_id);

-- RLS Policies for draft_line_items (via draft_orders ownership)
CREATE POLICY "Users can read own draft line items" 
    ON draft_line_items FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own draft line items" 
    ON draft_line_items FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own draft line items" 
    ON draft_line_items FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own draft line items" 
    ON draft_line_items FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.user_id = auth.uid()
        )
    );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_draft_orders_updated_at ON draft_orders;
CREATE TRIGGER update_draft_orders_updated_at
    BEFORE UPDATE ON draft_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_draft_line_items_updated_at ON draft_line_items;
CREATE TRIGGER update_draft_line_items_updated_at
    BEFORE UPDATE ON draft_line_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
