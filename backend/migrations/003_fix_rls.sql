-- Supabase SQLエディターで実行する、問い合わせテーブルの公開書き込み権限を修正するSQL。

-- 問い合わせの登録はバックエンドの service_role が行うため、anon の INSERT 権限を削除する。
-- 公開ユーザーから直接テーブルへ書き込める経路を閉じ、既存ポリシーがなくても安全に実行できるようにする。
DROP POLICY IF EXISTS "anon insert contacts" ON contacts;
