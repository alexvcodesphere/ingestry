-- Migration: Allow viewing all tenant members and expose basic user info
-- 1. Update RLS on tenant_members to allow seeing colleagues
-- 2. Create view to expose email/name from auth.users safely

------------------------------------------------------------
-- 1. Update tenant_members RLS
------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own membership" ON tenant_members;

-- Allow users to view ANY membership row that belongs to their tenant
CREATE POLICY "Users can view tenant members" ON tenant_members
    FOR SELECT USING (tenant_id = get_user_tenant_id());

------------------------------------------------------------
-- 2. Create tenant_user_profiles View
------------------------------------------------------------
-- This view runs with the privileges of the creator (postgres), 
-- bypassing the direct restriction on auth.users, but we filter safely.

CREATE OR REPLACE VIEW tenant_user_profiles AS
SELECT 
    au.id as user_id,
    au.email,
    -- Extract metadata safely if needed
    (au.raw_user_meta_data->>'full_name') as full_name,
    (au.raw_user_meta_data->>'avatar_url') as avatar_url,
    tm.tenant_id,
    tm.role
FROM auth.users au
JOIN tenant_members tm ON au.id = tm.user_id;

-- Grant access to authenticated users
GRANT SELECT ON tenant_user_profiles TO authenticated;

-- Enable RLS on the view (conceptually) or filter via where clause?
-- Postgres views don't have RLS themselves usually, they rely on underlying RLS 
-- OR we bake the security into the view definition.
-- Since we are filtering by JOINing tenant_members, and tenant_members has RLS,
-- does the view respect it?
-- Standard Views run as the OWNER. The RLS on tenant_members might be bypassed 
-- if the owner (postgres) reads it.
-- SO we MUST add the filter explicitly to be safe.

-- Re-defining with explicit security filter to be 100% sure
CREATE OR REPLACE VIEW tenant_user_profiles AS
SELECT 
    au.id as user_id,
    au.email,
    (au.raw_user_meta_data->>'full_name') as full_name,
    (au.raw_user_meta_data->>'avatar_url') as avatar_url,
    tm.tenant_id,
    tm.role
FROM auth.users au
JOIN tenant_members tm ON au.id = tm.user_id
WHERE tm.tenant_id = get_user_tenant_id();

GRANT SELECT ON tenant_user_profiles TO authenticated;
