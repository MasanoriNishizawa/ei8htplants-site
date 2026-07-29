-- Online shop: products, orders, order_items

CREATE TABLE products (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    description   TEXT,
    price         INTEGER     NOT NULL CHECK (price >= 0),
    stock         INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
    image_urls    TEXT[]      DEFAULT '{}',
    is_published  BOOLEAN     NOT NULL DEFAULT false,
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read published products" ON products
    FOR SELECT TO anon USING (is_published = true);
CREATE POLICY "service manage products" ON products
    FOR ALL TO service_role USING (true);

CREATE TABLE orders (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name     TEXT        NOT NULL,
    customer_email    TEXT        NOT NULL,
    customer_phone    TEXT,
    postal_code       TEXT        NOT NULL,
    prefecture        TEXT        NOT NULL,
    city              TEXT        NOT NULL,
    address_line1     TEXT        NOT NULL,
    address_line2     TEXT,
    note              TEXT,
    subtotal          INTEGER     NOT NULL,
    shipping_fee      INTEGER     NOT NULL,
    total             INTEGER     NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'paid',
    square_payment_id TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manage orders" ON orders
    FOR ALL TO service_role USING (true);

CREATE TABLE order_items (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID        REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT        NOT NULL,
    price        INTEGER     NOT NULL,
    quantity     INTEGER     NOT NULL CHECK (quantity > 0),
    created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service manage order_items" ON order_items
    FOR ALL TO service_role USING (true);

-- 在庫をアトミックに減算する関数。
-- 在庫が足りない場合は false を返すため、アプリ層でロールバック処理を行う。
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    updated integer;
BEGIN
    UPDATE products
    SET stock = stock - p_quantity
    WHERE id = p_product_id AND stock >= p_quantity;
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated > 0;
END;
$$;
