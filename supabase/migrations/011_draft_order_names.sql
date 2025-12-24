-- Migration: Add name column to draft_orders
-- Enables users to give descriptive names to order processing runs

ALTER TABLE draft_orders ADD COLUMN IF NOT EXISTS name TEXT;

-- Comment for documentation
COMMENT ON COLUMN draft_orders.name IS 'User-friendly name for the order processing run';
