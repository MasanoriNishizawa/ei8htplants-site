-- 016: イベント管理情報を専用テーブルに移す（手順1/2：新しいコードのデプロイ前に実行する）
--
-- 目的: events テーブルは未ログインでも全列を読める設定（public read events）のため、
--       events.admin_info（搬入・宿泊・出店料・出店要項など）が Supabase に直接問い合わせると読めてしまう。
--       ログインしていない人は読めない専用テーブルに移す。
--
-- この SQL は今の本番を壊さない（events.admin_info は残したまま、新しいテーブルに写すだけ）。
-- 何度実行しても同じ結果になる。

BEGIN;

-- 1. 管理情報の専用テーブルを作る（1イベントにつき1行）
CREATE TABLE IF NOT EXISTS event_admin_info (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,  -- 対象イベント。イベントを消すと管理情報も消える
  info jsonb NOT NULL DEFAULT '{}'::jsonb,                            -- 管理情報の中身（搬入・宿泊・出店料・出店要項など）
  updated_at timestamptz NOT NULL DEFAULT now()                        -- 最終更新日時
);

-- 2. 行ごとのアクセス制限を有効にし、サーバー（service_role）だけが読み書きできるようにする。
--    anon（未ログイン）・authenticated 向けのポリシーは作らないので、どちらからも読めない
ALTER TABLE event_admin_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON event_admin_info;
CREATE POLICY "service_role_all" ON event_admin_info FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. 二重の守り: Supabase が新しいテーブルに自動で付ける anon・authenticated の権限も取り消す
--    （万一 RLS が無効にされても読めないようにする）
REVOKE ALL ON event_admin_info FROM anon, authenticated;

-- 4. 今ある管理情報を新しいテーブルに写す（空のものは写さない。既に行があるイベントは上書きしない）
INSERT INTO event_admin_info (event_id, info)
SELECT id, admin_info
FROM events
WHERE admin_info IS NOT NULL
  AND admin_info <> '{}'::jsonb
ON CONFLICT (event_id) DO NOTHING;

-- 5. 切り替えの間の取りこぼし防止:
--    この SQL を実行してから新しいコードに切り替わるまでの間に、古いコードが events.admin_info に
--    書き込んでも、同じ内容を新しいテーブルへ自動で写す（後から書いた内容で上書きする）。
--    017 でこの自動処理と古い列を一緒に削除する
CREATE OR REPLACE FUNCTION sync_event_admin_info_from_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 管理情報が空でないときだけ写す
  IF NEW.admin_info IS NOT NULL AND NEW.admin_info <> '{}'::jsonb THEN
    INSERT INTO event_admin_info (event_id, info, updated_at)
    VALUES (NEW.id, NEW.admin_info, now())
    ON CONFLICT (event_id) DO UPDATE SET info = EXCLUDED.info, updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_admin_info ON events;
CREATE TRIGGER trg_sync_event_admin_info
AFTER INSERT OR UPDATE OF admin_info ON events
FOR EACH ROW
EXECUTE FUNCTION sync_event_admin_info_from_events();

COMMIT;

-- 6. Supabase の API にテーブルが増えたことを知らせる（すぐ新しいテーブルを使えるようにする）
NOTIFY pgrst, 'reload schema';
