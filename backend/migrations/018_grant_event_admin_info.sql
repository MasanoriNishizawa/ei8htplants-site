-- 018: サーバー（service_role）に event_admin_info の読み書き権限を付ける
--
-- 016 で作ったテーブルには、この Supabase プロジェクトでは service_role の権限が自動で付かず、
-- サーバーが管理情報を読み書きできなかった（permission denied for table event_admin_info）。
-- anon・authenticated には付けない（016 で取り消したまま）。

-- 1. サーバーだけに読み書きの権限を付ける
GRANT SELECT, INSERT, UPDATE, DELETE ON event_admin_info TO service_role;

-- 2. Supabase の API に権限の変更を知らせる
NOTIFY pgrst, 'reload schema';
