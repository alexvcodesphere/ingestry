-- Migration: Fix Draft Orders RLS
-- Drops old user-centric policies that were missed in migration 005 due to naming mismatch.
-- Ensures only tenant isolation applies, allowing all tenant members to access draft orders.

------------------------------------------------------------
-- Fix 'draft_orders' RLS
------------------------------------------------------------

-- Drop old user-centric policies created in 003_draft_orders.sql
DROP POLICY IF EXISTS "Users can read own draft orders" ON draft_orders;
DROP POLICY IF EXISTS "Users can create own draft orders" ON draft_orders;
DROP POLICY IF EXISTS "Users can update own draft orders" ON draft_orders;
DROP POLICY IF EXISTS "Users can delete own draft orders" ON draft_orders;

-- Drop incorrect policy name if it exists (from 005 attempt)
DROP POLICY IF EXISTS "Users can read own jobs" ON draft_orders;

-- Re-assert Tenant Isolation
-- Ensure the policy exists and is correct
DROP POLICY IF EXISTS "Tenant isolation" ON draft_orders;
CREATE POLICY "Tenant isolation" ON draft_orders
    FOR ALL USING (tenant_id = get_user_tenant_id());
