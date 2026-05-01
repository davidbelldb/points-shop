CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ACCOUNT MODULE -------------------------------------------------------------
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    photo_url       TEXT,
    points_balance  INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail for every points change
CREATE TABLE points_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID NOT NULL REFERENCES accounts(id),
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ledger_account ON points_ledger(account_id, created_at DESC);

-- PRODUCT MODULE -------------------------------------------------------------
CREATE TABLE products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku           TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    price_points  INTEGER NOT NULL CHECK (price_points >= 0),
    thumbnail_url TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_type  TEXT NOT NULL CHECK (media_type IN ('image','video')),
    url         TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_product_media_product ON product_media(product_id, sort_order);

-- INVENTORY MODULE -----------------------------------------------------------
CREATE TABLE inventory (
    product_id      UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    stock_qty       INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    lead_time_days  INTEGER NOT NULL DEFAULT 0 CHECK (lead_time_days >= 0),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BASKET / ORDERS MODULE -----------------------------------------------------
CREATE TABLE baskets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id  UUID NOT NULL REFERENCES accounts(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE basket_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basket_id   UUID NOT NULL REFERENCES baskets(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id),
    qty         INTEGER NOT NULL CHECK (qty > 0),
    UNIQUE(basket_id, product_id)
);

CREATE TABLE orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id    UUID NOT NULL REFERENCES accounts(id),
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled')),
    total_points  INTEGER NOT NULL CHECK (total_points >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_account ON orders(account_id, created_at DESC);

CREATE TABLE order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    product_name        TEXT NOT NULL,        -- snapshot at order time
    qty                 INTEGER NOT NULL CHECK (qty > 0),
    unit_price_points   INTEGER NOT NULL CHECK (unit_price_points >= 0),
    line_total_points   INTEGER NOT NULL CHECK (line_total_points >= 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
