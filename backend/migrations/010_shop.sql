-- オンラインショップの商品・注文・注文明細テーブルを作成し、公開読み取りと管理権限を設定する。

-- オンラインショップで販売する商品の価格・在庫・公開状態・画像を保存する。
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
-- 公開ページには公開済み商品のみを読み取り可能にする。
CREATE POLICY "public read published products" ON products
    FOR SELECT TO anon USING (is_published = true);
-- 商品の追加・更新・削除はバックエンドのサービスロールに限定する。
CREATE POLICY "service manage products" ON products
    FOR ALL TO service_role USING (true);

-- 顧客の注文と配送先、決済状態を保存する。購入時点の注文内容を管理画面で確認する。
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
-- 注文情報はバックエンドのサービスロールのみが管理する。
CREATE POLICY "service manage orders" ON orders
    FOR ALL TO service_role USING (true);

-- 注文に含まれる商品ごとの購入時点の商品名・価格・数量を保存する明細。
-- 注文削除時は明細も削除し、商品削除時は商品IDだけを NULL にして購入履歴を残す。
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
-- 注文明細はバックエンドのサービスロールのみが管理する。
CREATE POLICY "service manage order_items" ON order_items
    FOR ALL TO service_role USING (true);

-- 在庫をアトミックに減算する関数。
-- 引数は対象商品UUIDと減算数。戻り値 true は在庫を確保できたことを示す。
-- 在庫が足りない場合は false を返すため、アプリ層でロールバック処理を行う。
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    -- UPDATE が在庫を確保できた商品行数。1行以上なら減算成功として返す。
    updated integer;
BEGIN
    UPDATE products
    SET stock = stock - p_quantity
    WHERE id = p_product_id AND stock >= p_quantity;
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated > 0;
END;
$$;
