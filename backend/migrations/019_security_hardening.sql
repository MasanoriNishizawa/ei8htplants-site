-- 019: データベースの権限を絞る（セキュリティの強化）
--
-- Supabase の SQL Editor で実行する。何度実行しても同じ結果になるように書いている
-- （DROP ... IF EXISTS のあとに CREATE、CREATE OR REPLACE、REVOKE / GRANT は繰り返しても同じ）。
--
-- 前提: サーバー（backend）は、予約・記事・在庫の読み書きをすべて service_role のキー
--       （admin_supabase）で行っている。service_role は RLS を通らないので、
--       ここで anon・authenticated の権限を絞ってもサイトの動きは変わらない。
--       （確認したコード: backend/app/routes/reserve.py・articles.py・orders.py・seo.py・chat.py）

BEGIN;

-- 1. ワークショップ予約: 誰でも直接 INSERT できるポリシーを消す
--    予約はサーバーの API（POST /api/reserve）経由で、service_role が書き込む。
--    anon キーはフロントに公開されているため、このポリシーがあると API の入力チェック・
--    満席の確認・回数制限を通らずに予約を作れてしまう。
--    ポリシー名は環境によって 2 通り（supabase/schema.sql と設計書）あるので両方消す。
DROP POLICY IF EXISTS "workshop_reservations: public insert" ON workshop_reservations;
DROP POLICY IF EXISTS "anon insert reservations" ON workshop_reservations;

-- 2. 記事: RLS を有効にし、anon には公開済みの記事だけ読ませる
--    012 で「GRANT SELECT ON articles TO anon」を付けているが、RLS が無効のままだと
--    下書き（is_published = false）も anon キーで読めてしまう。
--    GRANT はそのまま残し（表を読む権限）、どの行を読めるかを RLS のポリシーで絞る。
--    サーバーは service_role で読むので、管理画面の下書き一覧には影響しない。
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "articles: public read published" ON articles;
CREATE POLICY "articles: public read published" ON articles
    FOR SELECT TO anon
    USING (is_published = true);

-- 3. 在庫を減らす関数: 数量が 1 以上のときだけ減らす
--    負の数を渡されると在庫が増えてしまうため、0 以下（と NULL）は何もせず false を返す。
--    CREATE OR REPLACE は既存の権限を引き継ぐので、下の 4. で改めて権限を絞る。
CREATE OR REPLACE FUNCTION decrement_stock(p_product_id uuid, p_quantity integer)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    updated integer;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN false;
    END IF;
    UPDATE products
    SET stock = stock - p_quantity
    WHERE id = p_product_id AND stock >= p_quantity;
    GET DIAGNOSTICS updated = ROW_COUNT;
    RETURN updated > 0;
END;
$$;

-- 4. 在庫の関数をサーバー（service_role）だけが呼べるようにする
--    PostgreSQL は関数の実行権限を既定で PUBLIC（全員）に付けるため、anon キーで
--    /rest/v1/rpc/decrement_stock などを直接呼んで在庫を書き換えられる状態だった。
--    PUBLIC・anon・authenticated から取り消し、service_role にだけ付ける。
REVOKE EXECUTE ON FUNCTION decrement_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION decrement_stock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION increment_stock(uuid, integer) TO service_role;

COMMIT;

-- 5. Supabase の API（PostgREST）に権限の変更を知らせる
NOTIFY pgrst, 'reload schema';
