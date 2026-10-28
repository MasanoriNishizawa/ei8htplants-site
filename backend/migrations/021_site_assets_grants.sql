-- 公開サイトと認証済み利用者に site_assets の読み取りを許可し、バックエンドに管理権限を付与する。
-- public スキーマの利用権限を設定したうえで、anon/authenticated は SELECT、service_role は CRUD を行える。
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.site_assets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_assets TO service_role;
