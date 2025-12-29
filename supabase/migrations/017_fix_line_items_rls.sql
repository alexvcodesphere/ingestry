-- Migration: Fix RLS for Draft Line Items
-- Updates the Row Level Security policies for 'draft_line_items' to respect Tenant isolation 
-- instead of User ownership. This allows all tenant members to see/edit line items.

------------------------------------------------------------
-- Fix RLS Policies for draft_line_items
------------------------------------------------------------

-- Drop existing user-centric policies
DROP POLICY IF EXISTS "Users can read own draft line items" ON draft_line_items;
DROP POLICY IF EXISTS "Users can insert own draft line items" ON draft_line_items;
DROP POLICY IF EXISTS "Users can update own draft line items" ON draft_line_items;
DROP POLICY IF EXISTS "Users can delete own draft line items" ON draft_line_items;

-- Create new tenant-centric policies
-- Read: Allow if the parent order belongs to the user's tenant
CREATE POLICY "Tenant isolation for select" 
    ON draft_line_items FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.tenant_id = get_user_tenant_id()
        )
    );

-- Insert: Allow if the parent order belongs to the user's tenant
CREATE POLICY "Tenant isolation for insert" 
    ON draft_line_items FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.tenant_id = get_user_tenant_id()
        )
    );

-- Update: Allow if the parent order belongs to the user's tenant
CREATE POLICY "Tenant isolation for update" 
    ON draft_line_items FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.tenant_id = get_user_tenant_id()
        )
    );

-- Delete: Allow if the parent order belongs to the user's tenant
CREATE POLICY "Tenant isolation for delete" 
    ON draft_line_items FOR DELETE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM draft_orders 
            WHERE draft_orders.id = draft_line_items.draft_order_id 
            AND draft_orders.tenant_id = get_user_tenant_id()
        )
    );
