-- 017: events テーブルから管理情報の列を削除する（手順2/2：新しいコードのデプロイ完了後に実行する）
--
-- 016 で管理情報を event_admin_info に写し、サーバーも新しいテーブルを読み書きするようになった後に実行する。
-- この列が残っている間は、未ログインでも Supabase に直接問い合わせると管理情報を読めてしまうため、必ず削除する。
-- 途中で失敗した場合は全体が取り消される（BEGIN〜COMMIT）。

BEGIN;

-- 1. 016 で作った自動の写し（トリガーと関数）を削除する
DROP TRIGGER IF EXISTS trg_sync_event_admin_info ON events;
DROP FUNCTION IF EXISTS sync_event_admin_info_from_events();

-- 2. 念のため、まだ新しいテーブルに無い管理情報を写してから削除する
INSERT INTO event_admin_info (event_id, info)
SELECT id, admin_info
FROM events
WHERE admin_info IS NOT NULL
  AND admin_info <> '{}'::jsonb
ON CONFLICT (event_id) DO NOTHING;

-- 3. events テーブルの admin_info 列を削除する
ALTER TABLE events DROP COLUMN IF EXISTS admin_info;

COMMIT;

-- 4. Supabase の API に列が減ったことを知らせる
NOTIFY pgrst, 'reload schema';
