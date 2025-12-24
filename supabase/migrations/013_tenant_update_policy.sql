-- Migration: Allow tenant members to update their tenant settings
-- Adds UPDATE policy for tenants table

-- Add UPDATE policy for tenants
DROP POLICY IF EXISTS "Users can update own tenant" ON tenants;
CREATE POLICY "Users can update own tenant" ON tenants
    FOR UPDATE USING (id = get_user_tenant_id());
