-- 在庫ロールバック用に在庫を安全に加算するRPC
CREATE OR REPLACE FUNCTION increment_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE products SET stock = stock + p_quantity WHERE id = p_product_id;
END;
$$;
