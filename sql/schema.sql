-- =============================================================================
-- PHARMACARE POS — COMPLETE DATABASE SCHEMA
-- =============================================================================
-- Run this entire file in your Supabase SQL Editor (in order).
-- No Supabase Auth required — uses a custom users table + secure_login RPC.
-- RLS is enabled but open to anon key (USING true) since auth is handled
-- via the custom secure_login RPC and session data stored client-side.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- 1. SHOPS (tenants)
-- =============================================================================
CREATE TABLE IF NOT EXISTS shops (
    id                  BIGSERIAL    PRIMARY KEY,
    name                TEXT         NOT NULL,
    phone               TEXT,
    address             TEXT,
    email               TEXT,
    logo_url            TEXT,
    -- subscription
    plan_name           TEXT         NOT NULL DEFAULT 'trial',   -- trial | starter | pro | enterprise
    subscription_plan   TEXT,
    subscription_fee    NUMERIC(10,2) DEFAULT 0,
    next_billing_date   DATE,
    plan_id             BIGINT,
    status              TEXT         NOT NULL DEFAULT 'active',  -- active | suspended | trial
    -- settings (theme, currency, footer text, etc.)
    settings            JSONB        NOT NULL DEFAULT '{}',
    invoice_footer      TEXT,
    print_size          TEXT         DEFAULT 'thermal',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. USERS (custom auth — no Supabase Auth required)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL    PRIMARY KEY,
    shop_id       BIGINT       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    username      TEXT         NOT NULL,
    email         TEXT,
    password      TEXT         NOT NULL,   -- SHA-256 hex hash
    role          TEXT         NOT NULL DEFAULT 'cashier',  -- admin | manager | cashier | accountant
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    permissions   JSONB        NOT NULL DEFAULT '[]',       -- allowed module ids
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, username)
);

-- =============================================================================
-- 3. SECURE LOGIN RPC
-- =============================================================================
-- Called by Login.jsx: supabase.rpc('secure_login', { p_username, p_password_hash })
-- Returns the matching user row (any shop) or empty array.
-- =============================================================================
CREATE OR REPLACE FUNCTION secure_login(
    p_username      TEXT,
    p_password_hash TEXT
)
RETURNS TABLE (
    id          BIGINT,
    shop_id     BIGINT,
    username    TEXT,
    email       TEXT,
    role        TEXT,
    is_active   BOOLEAN,
    permissions JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id, u.shop_id, u.username, u.email,
        u.role, u.is_active, u.permissions
    FROM users u
    WHERE LOWER(u.username) = LOWER(p_username)
    AND   u.password         = p_password_hash
    AND   u.is_active        = TRUE
    LIMIT 1;
END;
$$;

-- =============================================================================
-- 4. ANNOUNCEMENTS (system notices shown in the app)
-- =============================================================================
CREATE TABLE IF NOT EXISTS announcements (
    id         BIGSERIAL   PRIMARY KEY,
    message    TEXT        NOT NULL,
    type       TEXT        NOT NULL DEFAULT 'info',   -- info | warning | error | success
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    shop_id    BIGINT      REFERENCES shops(id) ON DELETE CASCADE,  -- NULL = all shops
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. SUPPORT TICKETS
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id          BIGSERIAL   PRIMARY KEY,
    shop_id     BIGINT      NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    subject     TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'open',  -- open | in_progress | closed
    admin_reply TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. SUPPLIERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS suppliers (
    id         BIGSERIAL    PRIMARY KEY,
    shop_id    BIGINT       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name       TEXT         NOT NULL,
    phone      TEXT,
    company    TEXT,
    email      TEXT,
    address    TEXT,
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- outstanding payable (positive = we owe them)
    notes      TEXT,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7. PRODUCTS (medicine catalogue)
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
    id                    BIGSERIAL      PRIMARY KEY,
    shop_id               BIGINT         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name                  TEXT           NOT NULL,           -- brand name e.g. "Panadol"
    generic_name          TEXT,                              -- INN name e.g. "Paracetamol"
    manufacturer          TEXT,
    category              TEXT,
    unit                  TEXT           NOT NULL DEFAULT 'Tablet',
    barcode               TEXT,
    sale_price            NUMERIC(10,2)  NOT NULL DEFAULT 0,
    cost_price            NUMERIC(10,2)  NOT NULL DEFAULT 0,
    requires_prescription BOOLEAN        NOT NULL DEFAULT FALSE,
    shelf_location        TEXT,
    description           TEXT,
    is_active             BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8. SHELVES / RACK LOCATIONS
-- =============================================================================
CREATE TABLE IF NOT EXISTS shelves (
    id         BIGSERIAL PRIMARY KEY,
    shop_id    BIGINT    NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    rack_no    TEXT      NOT NULL,
    bin_no     TEXT,
    label      TEXT,
    capacity   INTEGER,
    notes      TEXT
);

-- =============================================================================
-- 9. PRODUCT BATCHES (FIFO inventory)
-- =============================================================================
-- Each stock receipt creates one batch row.
-- FIFO = sort by expiry_date ASC, consume earliest first.
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_batches (
    id                 BIGSERIAL      PRIMARY KEY,
    shop_id            BIGINT         NOT NULL REFERENCES shops(id)    ON DELETE CASCADE,
    product_id         BIGINT         NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number       TEXT           NOT NULL,
    manufacture_date   DATE,
    expiry_date        DATE,
    purchase_price     NUMERIC(10,2)  NOT NULL DEFAULT 0,
    sale_price         NUMERIC(10,2)  NOT NULL DEFAULT 0,
    quantity_received  INTEGER        NOT NULL DEFAULT 0,
    quantity_remaining INTEGER        NOT NULL DEFAULT 0,
    shelf_location     TEXT,
    rack_no            TEXT,
    bin_no             TEXT,
    shelf_id           BIGINT         REFERENCES shelves(id) ON DELETE SET NULL,
    supplier_id        BIGINT         REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_id        BIGINT,        -- back-reference to purchases (set after insert)
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qty_remaining CHECK (quantity_remaining >= 0)
);

-- FIFO index — most critical query: shop + product ordered by earliest expiry
CREATE INDEX IF NOT EXISTS idx_batches_fifo
    ON product_batches(shop_id, product_id, expiry_date ASC)
    WHERE quantity_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_batches_expiry
    ON product_batches(shop_id, expiry_date ASC)
    WHERE quantity_remaining > 0;

-- =============================================================================
-- 10. CUSTOMERS (credit accounts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customers (
    id         BIGSERIAL    PRIMARY KEY,
    shop_id    BIGINT       NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name       TEXT         NOT NULL,
    phone      TEXT,
    email      TEXT,
    address    TEXT,
    balance    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- outstanding receivable (positive = they owe us)
    notes      TEXT,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 11. SALES (invoices / receipts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sales (
    id                 BIGSERIAL      PRIMARY KEY,
    shop_id            BIGINT         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id        BIGINT         REFERENCES customers(id) ON DELETE SET NULL,
    invoice_no         TEXT,
    status             TEXT           NOT NULL DEFAULT 'completed',  -- completed | returned | void
    subtotal           NUMERIC(10,2)  NOT NULL DEFAULT 0,
    discount           NUMERIC(10,2)  NOT NULL DEFAULT 0,
    total_amount       NUMERIC(10,2)  NOT NULL DEFAULT 0,
    paid_amount        NUMERIC(10,2)  NOT NULL DEFAULT 0,
    payment_type       TEXT           NOT NULL DEFAULT 'cash',  -- cash | credit | partial | split
    prescription_ref   TEXT,
    notes              TEXT,
    served_by          BIGINT         REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_shop_date ON sales(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id) WHERE customer_id IS NOT NULL;

-- =============================================================================
-- 12. SALE ITEMS (line items with batch traceability)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sale_items (
    id              BIGSERIAL      PRIMARY KEY,
    sale_id         BIGINT         NOT NULL REFERENCES sales(id)           ON DELETE CASCADE,
    product_id      BIGINT         NOT NULL REFERENCES products(id)        ON DELETE RESTRICT,
    batch_id        BIGINT         REFERENCES product_batches(id)          ON DELETE SET NULL,
    product_name    TEXT           NOT NULL,   -- snapshot at time of sale
    batch_number    TEXT,
    expiry_date     DATE,
    quantity        INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price      NUMERIC(10,2)  NOT NULL,
    discount        NUMERIC(10,2)  NOT NULL DEFAULT 0,
    total           NUMERIC(10,2)  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- =============================================================================
-- 13. TRIGGER: Deduct batch qty on sale_items INSERT / restore on DELETE
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_deduct_batch_quantity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.batch_id IS NOT NULL THEN
        -- Validate stock
        IF (SELECT quantity_remaining FROM product_batches WHERE id = NEW.batch_id) < NEW.quantity THEN
            RAISE EXCEPTION 'Insufficient stock in batch %. Available: %, Requested: %',
                NEW.batch_id,
                (SELECT quantity_remaining FROM product_batches WHERE id = NEW.batch_id),
                NEW.quantity;
        END IF;
        UPDATE product_batches
        SET quantity_remaining = quantity_remaining - NEW.quantity
        WHERE id = NEW.batch_id;

    ELSIF TG_OP = 'DELETE' AND OLD.batch_id IS NOT NULL THEN
        -- Return stock on sale void / return
        UPDATE product_batches
        SET quantity_remaining = quantity_remaining + OLD.quantity
        WHERE id = OLD.batch_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_items_deduct ON sale_items;
CREATE TRIGGER trg_sale_items_deduct
    AFTER INSERT OR DELETE ON sale_items
    FOR EACH ROW EXECUTE FUNCTION trg_deduct_batch_quantity();

-- =============================================================================
-- 14. CUSTOMER PAYMENTS (credit settlements)
-- =============================================================================
CREATE TABLE IF NOT EXISTS customer_payments (
    id           BIGSERIAL      PRIMARY KEY,
    shop_id      BIGINT         NOT NULL REFERENCES shops(id)      ON DELETE CASCADE,
    customer_id  BIGINT         NOT NULL REFERENCES customers(id)  ON DELETE CASCADE,
    amount       NUMERIC(10,2)  NOT NULL,
    payment_type TEXT           NOT NULL DEFAULT 'cash',  -- cash | bank | return | refund
    note         TEXT,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 15. PURCHASES (stock receipts / GRNs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS purchases (
    id             BIGSERIAL      PRIMARY KEY,
    shop_id        BIGINT         NOT NULL REFERENCES shops(id)    ON DELETE CASCADE,
    supplier_id    BIGINT         REFERENCES suppliers(id)         ON DELETE SET NULL,
    invoice_number TEXT,
    total_amount   NUMERIC(10,2)  NOT NULL DEFAULT 0,
    paid_amount    NUMERIC(10,2)  NOT NULL DEFAULT 0,
    payment_type   TEXT           NOT NULL DEFAULT 'cash',  -- cash | credit
    status         TEXT           NOT NULL DEFAULT 'received',
    note           TEXT,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_shop ON purchases(shop_id, created_at DESC);

-- =============================================================================
-- 16. PURCHASE ITEMS (each line creates a product_batch)
-- =============================================================================
CREATE TABLE IF NOT EXISTS purchase_items (
    id             BIGSERIAL      PRIMARY KEY,
    purchase_id    BIGINT         NOT NULL REFERENCES purchases(id)  ON DELETE CASCADE,
    product_id     BIGINT         NOT NULL REFERENCES products(id)   ON DELETE RESTRICT,
    batch_number   TEXT           NOT NULL,
    expiry_date    DATE,
    quantity       INTEGER        NOT NULL CHECK (quantity > 0),
    bonus_qty      INTEGER        NOT NULL DEFAULT 0,
    purchase_price NUMERIC(10,2)  NOT NULL DEFAULT 0,
    sale_price     NUMERIC(10,2)  NOT NULL DEFAULT 0
);

-- =============================================================================
-- 17. SUPPLIER PAYMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS supplier_payments (
    id          BIGSERIAL      PRIMARY KEY,
    shop_id     BIGINT         NOT NULL REFERENCES shops(id)    ON DELETE CASCADE,
    supplier_id BIGINT         NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    amount      NUMERIC(10,2)  NOT NULL,
    payment_type TEXT          NOT NULL DEFAULT 'cash',
    note        TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 18. EXPENSES
-- =============================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id          BIGSERIAL      PRIMARY KEY,
    shop_id     BIGINT         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    category    TEXT           NOT NULL DEFAULT 'General',
    amount      NUMERIC(10,2)  NOT NULL,
    description TEXT,
    date        DATE           NOT NULL DEFAULT CURRENT_DATE,
    created_by  BIGINT         REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 19. EMPLOYEES
-- =============================================================================
CREATE TABLE IF NOT EXISTS employees (
    id         BIGSERIAL      PRIMARY KEY,
    shop_id    BIGINT         NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name       TEXT           NOT NULL,
    role       TEXT           NOT NULL DEFAULT 'Pharmacist',
    phone      TEXT,
    email      TEXT,
    salary     NUMERIC(10,2)  NOT NULL DEFAULT 0,
    join_date  DATE,
    is_active  BOOLEAN        NOT NULL DEFAULT TRUE,
    notes      TEXT,
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 20. EMPLOYEE SALARY PAYMENTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS employee_payments (
    id          BIGSERIAL      PRIMARY KEY,
    shop_id     BIGINT         NOT NULL REFERENCES shops(id)    ON DELETE CASCADE,
    employee_id BIGINT         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount      NUMERIC(10,2)  NOT NULL,
    month       TEXT,          -- e.g. "2025-03"
    note        TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 21. VIEWS
-- =============================================================================

-- Aggregated stock per product (excludes zero-quantity batches)
CREATE OR REPLACE VIEW stock_by_product AS
SELECT
    pb.shop_id,
    pb.product_id,
    p.name                          AS product_name,
    p.generic_name,
    p.category,
    p.unit,
    p.sale_price                    AS default_sale_price,
    p.requires_prescription,
    p.shelf_location,
    SUM(pb.quantity_remaining)      AS total_quantity,
    COUNT(pb.id)                    AS active_batch_count,
    MIN(pb.expiry_date)             AS nearest_expiry,
    BOOL_OR(pb.expiry_date IS NOT NULL AND pb.expiry_date <= CURRENT_DATE + 90) AS has_expiring_soon,
    BOOL_OR(pb.expiry_date IS NOT NULL AND pb.expiry_date <  CURRENT_DATE)      AS has_expired_stock
FROM product_batches pb
JOIN products p ON p.id = pb.product_id
WHERE pb.quantity_remaining > 0
GROUP BY pb.shop_id, pb.product_id, p.name, p.generic_name, p.category,
         p.unit, p.sale_price, p.requires_prescription, p.shelf_location;

-- =============================================================================
-- 22. RPCs
-- =============================================================================

-- FIFO batch selector: returns ordered batches to fulfill a quantity request
CREATE OR REPLACE FUNCTION get_fifo_batches(
    p_shop_id    BIGINT,
    p_product_id BIGINT,
    p_quantity   INTEGER
)
RETURNS TABLE (
    batch_id           BIGINT,
    batch_number       TEXT,
    expiry_date        DATE,
    shelf_location     TEXT,
    quantity_remaining INTEGER,
    sale_price         NUMERIC,
    deduct_qty         INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_remaining INTEGER := p_quantity;
    v_batch     product_batches%ROWTYPE;
    v_deduct    INTEGER;
BEGIN
    FOR v_batch IN
        SELECT * FROM product_batches
        WHERE  shop_id            = p_shop_id
        AND    product_id         = p_product_id
        AND    quantity_remaining > 0
        ORDER  BY expiry_date ASC NULLS LAST, created_at ASC
    LOOP
        EXIT WHEN v_remaining <= 0;
        v_deduct           := LEAST(v_batch.quantity_remaining, v_remaining);
        batch_id           := v_batch.id;
        batch_number       := v_batch.batch_number;
        expiry_date        := v_batch.expiry_date;
        shelf_location     := v_batch.shelf_location;
        quantity_remaining := v_batch.quantity_remaining;
        sale_price         := v_batch.sale_price;
        deduct_qty         := v_deduct;
        RETURN NEXT;
        v_remaining := v_remaining - v_deduct;
    END LOOP;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Requested: %, Short by: %',
            p_product_id, p_quantity, v_remaining;
    END IF;
END;
$$;

-- Expiry alert RPC: batches expiring within N days
CREATE OR REPLACE FUNCTION expiring_soon(
    p_shop_id    BIGINT,
    p_days_ahead INTEGER DEFAULT 90
)
RETURNS TABLE (
    batch_id           BIGINT,
    product_id         BIGINT,
    product_name       TEXT,
    generic_name       TEXT,
    batch_number       TEXT,
    expiry_date        DATE,
    days_until_expiry  INTEGER,
    quantity_remaining INTEGER,
    shelf_location     TEXT,
    sale_price         NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pb.id,
        pb.product_id,
        p.name,
        p.generic_name,
        pb.batch_number,
        pb.expiry_date,
        (pb.expiry_date - CURRENT_DATE)::INTEGER,
        pb.quantity_remaining,
        pb.shelf_location,
        pb.sale_price
    FROM   product_batches pb
    JOIN   products p ON p.id = pb.product_id
    WHERE  pb.shop_id            = p_shop_id
    AND    pb.quantity_remaining > 0
    AND    pb.expiry_date        IS NOT NULL
    AND    pb.expiry_date        <= CURRENT_DATE + p_days_ahead
    ORDER  BY pb.expiry_date ASC, p.name ASC;
END;
$$;

-- Stock value (for balance sheet / reports)
CREATE OR REPLACE FUNCTION get_stock_value(p_shop_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_cost   NUMERIC(14,2);
    v_retail NUMERIC(14,2);
BEGIN
    SELECT
        SUM(pb.purchase_price * pb.quantity_remaining),
        SUM(pb.sale_price     * pb.quantity_remaining)
    INTO v_cost, v_retail
    FROM product_batches pb
    WHERE pb.shop_id            = p_shop_id
    AND   pb.quantity_remaining > 0;

    RETURN jsonb_build_object(
        'shop_id',          p_shop_id,
        'cost_value',       COALESCE(v_cost,   0),
        'retail_value',     COALESCE(v_retail, 0),
        'potential_profit', COALESCE(v_retail, 0) - COALESCE(v_cost, 0),
        'calculated_at',    NOW()
    );
END;
$$;

-- =============================================================================
-- 22b. SHOP STATUS & CONFIG RPCs (used by ProtectedRoute + Layout)
-- =============================================================================

-- Returns the shop's current status text ('active', 'suspended', 'trial')
CREATE OR REPLACE FUNCTION get_shop_status(p_shop_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT s.status INTO v_status
    FROM shops s
    WHERE s.id = p_shop_id;

    RETURN COALESCE(v_status, 'active');
END;
$$;

-- Returns shop config as JSONB (plan info, settings, etc.)
CREATE OR REPLACE FUNCTION get_shop_config(p_shop_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_shop shops%ROWTYPE;
BEGIN
    SELECT * INTO v_shop
    FROM shops
    WHERE id = p_shop_id;

    IF NOT FOUND THEN
        RETURN '{}'::JSONB;
    END IF;

    RETURN jsonb_build_object(
        'shop_id',           v_shop.id,
        'name',              v_shop.name,
        'plan_name',         v_shop.plan_name,
        'subscription_plan', v_shop.subscription_plan,
        'subscription_fee',  v_shop.subscription_fee,
        'next_billing_date', v_shop.next_billing_date,
        'status',            v_shop.status,
        'settings',          v_shop.settings
    );
END;
$$;

-- =============================================================================
-- 23. ROW LEVEL SECURITY
-- =============================================================================
-- Since this app uses custom auth (no Supabase JWT), we allow anon key access
-- on all tables. Tenant isolation is enforced in the application layer via shop_id.
-- For production hardening, replace USING (true) with a session-claim approach.
-- =============================================================================

ALTER TABLE shops             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_payments  ENABLE ROW LEVEL SECURITY;

-- Allow anon key full access (app enforces shop_id isolation)
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'shops','users','announcements','support_tickets','suppliers','products',
        'shelves','product_batches','customers','sales','sale_items',
        'customer_payments','purchases','purchase_items','supplier_payments',
        'expenses','employees','employee_payments'
    ];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "anon_all_%s" ON %I', t, t);
        EXECUTE format('CREATE POLICY "anon_all_%s" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)', t, t);
        EXECUTE format('DROP POLICY IF EXISTS "auth_all_%s" ON %I', t, t);
        EXECUTE format('CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
    END LOOP;
END $$;

-- =============================================================================
-- 24. SEED DATA — First shop + admin user
-- =============================================================================
-- Change these values before running!
-- Password hash is SHA-256 of 'admin123'
-- Generate your own: https://emn178.github.io/online-tools/sha256.html
-- =============================================================================

INSERT INTO shops (name, phone, address, plan_name, status)
VALUES ('PharmaCare', '0300-0000000', 'Your Address Here', 'pro', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO users (shop_id, username, email, password, role, permissions)
VALUES (
    (SELECT id FROM shops WHERE name = 'PharmaCare' LIMIT 1),
    'admin',
    'admin@pharmacare.com',
    '240be518fabd2724ddb6f04eeb1da5967448d7e831d06d6602a193b3c72e682',  -- SHA-256 of 'admin123'
    'admin',
    '[]'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Done! Your PharmaCare POS database is ready.
-- Login with:  username: admin  |  password: admin123
-- Change the password immediately after first login.
-- =============================================================================
