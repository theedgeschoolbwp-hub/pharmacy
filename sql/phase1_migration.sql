-- =============================================================================
-- PHASE 1 — CORE POS COMPLETENESS — SCHEMA MIGRATION
-- =============================================================================
-- Run this in your Supabase SQL Editor AFTER the main schema.sql
-- =============================================================================

-- 1. Add payment_details column to sales (for multi-payment breakdown)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_details JSONB;

-- 2. Add product_name and batch_number snapshot columns to sale_items (if missing)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2) DEFAULT 0;

-- 3. Sale Returns
CREATE TABLE IF NOT EXISTS sale_returns (
    id            BIGSERIAL    PRIMARY KEY,
    sale_id       BIGINT       NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    shop_id       BIGINT       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    return_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    reason        TEXT,
    note          TEXT,
    returned_by   BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id            BIGSERIAL    PRIMARY KEY,
    return_id     BIGINT       NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id  BIGINT       REFERENCES sale_items(id) ON DELETE SET NULL,
    product_id    BIGINT       NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id      BIGINT       REFERENCES product_batches(id) ON DELETE SET NULL,
    quantity      INTEGER      NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10,2) NOT NULL,
    total         NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_shop ON sale_returns(shop_id, created_at DESC);

-- 4. RLS for new tables
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_sale_returns" ON sale_returns;
CREATE POLICY "anon_all_sale_returns" ON sale_returns FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_sale_returns" ON sale_returns;
CREATE POLICY "auth_all_sale_returns" ON sale_returns FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_all_sale_return_items" ON sale_return_items;
CREATE POLICY "anon_all_sale_return_items" ON sale_return_items FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_sale_return_items" ON sale_return_items;
CREATE POLICY "auth_all_sale_return_items" ON sale_return_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Missing RPC — deduct batch stock (called by Sales.jsx)
CREATE OR REPLACE FUNCTION deduct_batch_stock(p_batch_id BIGINT, p_quantity INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE product_batches
    SET quantity_remaining = quantity_remaining - p_quantity
    WHERE id = p_batch_id AND quantity_remaining >= p_quantity;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient stock in batch %', p_batch_id;
    END IF;
END;
$$;

-- 6. Restore batch stock RPC (for returns)
CREATE OR REPLACE FUNCTION restore_batch_stock(p_batch_id BIGINT, p_quantity INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE product_batches
    SET quantity_remaining = quantity_remaining + p_quantity
    WHERE id = p_batch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch % not found', p_batch_id;
    END IF;
END;
$$;

-- =============================================================================
-- Done! Phase 1 schema changes applied.
-- =============================================================================
