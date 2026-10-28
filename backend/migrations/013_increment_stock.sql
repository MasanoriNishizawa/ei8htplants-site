-- 注文取消などの在庫ロールバック時に、指定商品の在庫を原子的に加算するRPC。
-- 引数 p_product_id は対象商品のUUID、p_quantity は戻す在庫数を表す。
-- 戻り値はなく、対象商品が存在する場合に stock へ数量を加算する。
CREATE OR REPLACE FUNCTION increment_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- 商品IDで対象行を特定し、現在の在庫に指定数を加算する。
    UPDATE products SET stock = stock + p_quantity WHERE id = p_product_id;
END;
$$;
