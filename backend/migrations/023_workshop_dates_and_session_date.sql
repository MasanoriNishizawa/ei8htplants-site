-- 023: ワークショップを「特定の日だけ」実施できるようにし、時間枠を日ごとに分けられるようにする
--
-- Supabase の SQL Editor で、全体を 1 回で実行する。何度実行しても同じ結果になるように書いている
-- （ADD COLUMN IF NOT EXISTS・CREATE OR REPLACE・DROP TRIGGER IF EXISTS・NULL の行だけを埋める UPDATE）。
--
-- この SQL でやること:
--   1. 列を足す
--      events.ws_dates            ... ワークショップを実施する日の一覧（JSON の配列 ["YYYY-MM-DD", ...]）。
--                                     NULL なら開催期間の全日程で実施する（今までと同じ動き）。
--                                     has_workshop が true で、複数日（end_date > start_date）のイベントだけで使う。
--      ws_sessions.session_date   ... その時間枠を使う日。NULL なら全日程で共通の枠（今までと同じ動き）。
--      ws_sessions.reserved_count ... その時間枠の予約済みの人数（キャンセルを除く・全日程の合計・目安の値）。
--                                     バックエンドが予約のたびに書き込んでいたが、列を作る SQL が無かったので正式に定義する。
--      workshop_reservations.is_walkin ... 当日参加（管理画面から登録した予約）か。当日参加だけは、その日に枠があっても
--                                     枠なし（時間の自由入力）で登録できる
--   2. 既存の予約を一度だけ直す（予約日・希望の時間が空の行を埋める）
--   3. 予約の保存・キャンセルからの戻し・予約日の変更のときに、予約日が実施する日か・時間枠が「同じイベントの枠」で
--      「その日に使える枠」かを DB で確かめるトリガー（日程の保存と 1 つずつ通るよう、イベントの行のロックを先に取る）
--   4. ワークショップを実施する日かを判定する関数 ws_is_workshop_day
--   5. イベント本体と時間枠を 1 つのトランザクションで保存し、既存の予約を確かめて新しい枠へ付け替える関数
--      save_event_schedule（移し先の無い予約があれば、何も保存せずに例外を出す）
--   6. 予約の状態をキャンセル以外に変える関数 reinstate_reservation（キャンセルからの戻しを含む。
--      イベント → 枠 → 予約 の順にロックしてから、ロックを取ったあとの状態で判断して確かめる）
--
-- 既存のデータ: 追加する列はすべて NULL（reserved_count は 0）で始まるので、今までと同じ動きになる。
--
-- 前提: 006（ws_sessions）・007（preferred_date・preferred_time）を実行済みであること。
--       新しいプログラムはイベントと時間枠の保存でこの関数を呼び、ws_dates・session_date を書き込むので、
--       この SQL はデプロイの前に実行する（実行しないとイベントと時間枠の保存が失敗する）。
--
-- エラーコード（関数・トリガーが出す例外の SQLSTATE。バックエンドがこれを見て HTTP の応答に変える）
--   P0404 ... イベントが無い（→ 404）
--   P0422 ... 実施日が空・開催期間の外、または時間枠の日付がイベントの実施日の設定に合わない（→ 422。文言をそのまま返す）
--   P0409 ... 移し先の無い予約がある（→ 409。DETAIL に JSON で [{date, time_label, count, participants}]）
--   P0410 ... 予約の時間枠が、予約日に使えない枠（別の日の枠）（→ 400）
--   P0411 ... 予約の時間枠が無い・別のイベントの枠（→ 400）
--   P0412 ... 予約日がワークショップを実施しない日（→ 400）
--   P0413 ... キャンセルから戻すときに時間枠が満席（→ 409）
--   P0414 ... キャンセルからの戻しを reinstate_reservation を通さずに行おうとした（→ 409。アプリはふつう出さない）

BEGIN;

-- ============================================================
-- 1. 列を足す
-- ============================================================

-- 1-1. イベントにワークショップの実施日の一覧の列を足す（NULL = 全日程で実施）
ALTER TABLE events ADD COLUMN IF NOT EXISTS ws_dates jsonb;

-- 1-2. 時間枠に「その枠を使う日」の列を足す（NULL = 全日程で共通の枠）
ALTER TABLE ws_sessions ADD COLUMN IF NOT EXISTS session_date date;

-- 1-3. 時間枠の予約済みの人数の列を正式に定義する（すでにある環境では何もしない）
ALTER TABLE ws_sessions ADD COLUMN IF NOT EXISTS reserved_count integer NOT NULL DEFAULT 0;

-- 1-4. 予約に「当日参加か」の列を足す。当日参加（管理画面から登録）は時間の自由入力（枠なし）を認めるので、
--      トリガーが「その日に枠があるのに枠なし」の予約を止めるとき、当日参加だけを見分けて通すために使う。
--      既存の当日参加（メールが walkin-…@nomail.invalid のダミー）は true で埋める。
--      （この UPDATE は is_walkin だけを変えるので、下のトリガーは動かない）
ALTER TABLE workshop_reservations ADD COLUMN IF NOT EXISTS is_walkin boolean NOT NULL DEFAULT false;
UPDATE workshop_reservations
   SET is_walkin = true
 WHERE is_walkin = false
   AND email LIKE 'walkin-%@nomail.invalid';

-- 1-5. 時間枠をイベントと日付で探すための索引（空き状況の API が日付で絞り込むため）
CREATE INDEX IF NOT EXISTS ws_sessions_event_date_idx ON ws_sessions (event_id, session_date);

-- ============================================================
-- 2. 既存の予約を一度だけ直す
-- ============================================================

-- 2-1. 1 日だけのイベント（終了日が無い・開始日以前）の予約で、予約日が空の行を開始日で埋める。
--      日付で絞って数える満席の確認に、日付の無い予約が入らず定員を超えてしまうのを防ぐ。
--      （複数日のイベントの日付の無い古い予約は、どの日の予約か決められないので埋めない）
UPDATE workshop_reservations r
   SET preferred_date = e.start_date::text
  FROM events e
 WHERE r.event_id = e.id
   AND r.preferred_date IS NULL
   AND (e.end_date IS NULL OR e.end_date <= e.start_date);

-- 2-2. 時間枠を指している予約で、希望の時間が空の行に、枠の表示名を入れる。
--      時間枠を作り直したときに、表示名で新しい枠へ付け替える手がかりにする。
UPDATE workshop_reservations r
   SET preferred_time = s.time_label
  FROM ws_sessions s
 WHERE r.session_id = s.id
   AND r.preferred_time IS NULL;

-- ============================================================
-- 3. 予約の実施日と時間枠を DB で確かめるトリガー
-- ============================================================

-- 予約の追加・キャンセルからの戻し・予約日や時間枠の変更のたびに呼ばれ、次を確かめる。違えば例外を出して保存させない。
--   - 新しい状態がキャンセルなら何もしない（キャンセルにする・キャンセルのままの変更）
--   - キャンセルからの戻しは、関数 reinstate_reservation の中（目印 app.reservation_reinstate = 'on'）でしか認めない。
--     ほかの経路（状態だけの UPDATE）は、ロックを取る前に P0414 で止める（満席の確認のすり抜けと行き詰まりを防ぐ）
--   - 更新で、枠・予約日が変わらず、キャンセル以外どうしの状態の変更（pending → confirmed など）なら何もしない
--     （前からある食い違った古いデータで、状態の変更が止まらないようにするため）
--   - 枠を消したときの SET NULL（枠だけが NULL になり、予約日は変わらない）なら何もしない
--   - それ以外は、先にイベントの行を FOR SHARE で取る。
--     FOR SHARE は save_event_schedule の FOR NO KEY UPDATE とぶつかるので、日程の保存と予約の保存は 1 つずつ通る
--     （日程の保存が先なら、予約はそれを待ってから新しい実施日で確かめる。予約が先なら、日程の保存はそれを待ってから
--       手順6でその予約を見て 409 にする）。ロックの順番は「イベント → 枠」で、イベントの削除・日程の保存と同じ
--   - 予約の追加・キャンセルからの戻し・予約日の変更では、ワークショップのあるイベントなら、予約日が実施する日かを
--     確かめる（ws_is_workshop_day。違えば P0412）。枠の有無にかかわらず確かめる。
--     予約日が空の古い予約（複数日のイベントの日付の無い予約）は、どの日か分からないので確かめない
--     （枠の付け替えだけの変更では確かめない。save_event_schedule の付け替えが古いデータで止まらないようにするため）
--   - 枠があれば、枠の行を FOR SHARE で読む（読んでからこの予約のトランザクションが終わるまで、管理者の枠の変更
--     （save_event_schedule の FOR UPDATE）を待たせる）
--   - 予約の追加・キャンセルからの戻しで、枠なしなのにその日に使える枠がある → P0411（当日参加 is_walkin は通す）
--   - 枠が無い・別のイベントの枠 → P0411
--   - 枠に日付があり、予約日と違う（予約日が空も含む） → P0410
CREATE OR REPLACE FUNCTION public.check_reservation_session()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    -- 予約のイベントの行
    v_event events%ROWTYPE;
    -- 予約が指している時間枠の行
    v_session ws_sessions%ROWTYPE;
    -- キャンセルから戻す更新か
    v_reinstate boolean;
    -- 実施日を確かめる変更か（追加・戻し・予約日の変更）
    v_check_day boolean;
    -- 予約のイベントの行が見つかったか
    v_event_found boolean;
BEGIN
    -- 1. キャンセルにする（キャンセルのままの）予約は確かめない
    IF NEW.status IS NOT DISTINCT FROM 'cancelled' THEN
        RETURN NEW;
    END IF;
    v_reinstate := TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'cancelled';
    -- 1-2. キャンセルからの戻しは、関数 reinstate_reservation の中でしか認めない（関数が目印を立てる）。
    --      状態だけの UPDATE で戻すと、予約の行を先にロックしてからイベントを待つことになり、日程の保存と
    --      行き詰まるうえ、満席の確認もすり抜けるため。ロックを取る前に止める
    IF v_reinstate AND COALESCE(current_setting('app.reservation_reinstate', true), '') <> 'on' THEN
        RAISE EXCEPTION 'reinstate_requires_function' USING ERRCODE = 'P0414';
    END IF;
    v_check_day := TG_OP = 'INSERT' OR v_reinstate OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date;
    -- 2. 枠・予約日が変わらない、キャンセル以外どうしの状態の変更は確かめない
    IF NOT v_check_day AND NEW.session_id IS NOT DISTINCT FROM OLD.session_id THEN
        RETURN NEW;
    END IF;
    -- 3. 枠を消したときの SET NULL（枠だけが NULL になる）は確かめない
    IF NOT v_check_day AND NEW.session_id IS NULL THEN
        RETURN NEW;
    END IF;
    -- 4. 日程の保存と 1 つずつ通るよう、先にイベントの行を取る
    SELECT * INTO v_event FROM events WHERE id = NEW.event_id FOR SHARE;
    v_event_found := FOUND;
    -- 5. ワークショップのあるイベントは、予約日が実施する日でなければ保存させない
    IF v_check_day AND v_event_found AND v_event.has_workshop AND NEW.preferred_date IS NOT NULL
       AND NOT public.ws_is_workshop_day(v_event, NEW.preferred_date) THEN
        RAISE EXCEPTION 'reservation_not_workshop_day' USING ERRCODE = 'P0412';
    END IF;
    -- 5-2. 予約の追加・キャンセルからの戻しで、枠なしの予約は、その日に使える枠があれば保存させない
    --      （予約の API が「その日に枠なし」と確かめたあとで、管理者が同じ日の枠を足した場合に備える。
    --        イベントのロックを取ったあとなので、枠を足す日程の保存が終わってから確かめる）。
    --      当日参加（is_walkin）は時間の自由入力を認めるので通す。枠の付け替え（save_event_schedule の手順6）は
    --      追加・戻しではないので、ここでは確かめない
    IF (TG_OP = 'INSERT' OR v_reinstate) AND NEW.session_id IS NULL AND NOT COALESCE(NEW.is_walkin, false)
       AND v_event_found AND v_event.has_workshop AND NEW.preferred_date IS NOT NULL
       AND EXISTS (SELECT 1 FROM ws_sessions
                    WHERE event_id = NEW.event_id
                      AND (session_date IS NULL OR session_date::text = NEW.preferred_date)) THEN
        RAISE EXCEPTION 'reservation_session_required' USING ERRCODE = 'P0411';
    END IF;
    -- 6. 時間枠の無い予約は、ここまで
    IF NEW.session_id IS NULL THEN
        RETURN NEW;
    END IF;
    -- 7. 時間枠の行を、変更されないよう共有ロックを取って読む
    SELECT * INTO v_session FROM ws_sessions WHERE id = NEW.session_id FOR SHARE;
    -- 8. 枠が無い・別のイベントの枠なら保存させない
    IF NOT FOUND OR v_session.event_id IS DISTINCT FROM NEW.event_id THEN
        RAISE EXCEPTION 'reservation_session_invalid' USING ERRCODE = 'P0411';
    END IF;
    -- 9. 日付のある枠は、その日の予約にしか使えない
    IF v_session.session_date IS NOT NULL
       AND v_session.session_date::text IS DISTINCT FROM NEW.preferred_date THEN
        RAISE EXCEPTION 'reservation_session_date_mismatch' USING ERRCODE = 'P0410';
    END IF;
    RETURN NEW;
END;
$$;

-- 予約の追加と、時間枠・予約日・状態の変更のときに動かす
DROP TRIGGER IF EXISTS workshop_reservations_check_session ON workshop_reservations;
CREATE TRIGGER workshop_reservations_check_session
    BEFORE INSERT OR UPDATE OF session_id, preferred_date, status ON workshop_reservations
    FOR EACH ROW EXECUTE FUNCTION public.check_reservation_session();

-- ============================================================
-- 4. ワークショップを実施する日かを判定する関数（バックエンドの reservation_policy.is_workshop_day と同じ決まり）
-- ============================================================

-- 引数: p_event ... events の行、p_day ... 確かめる日（'YYYY-MM-DD'。NULL なら実施しない日とみなす）
-- 戻り値: 実施する日なら true、それ以外は false（NULL は返さない）。実施する日は次をすべて満たす日
--   - has_workshop が true
--   - 開催期間（start_date〜end_date。end_date が無ければ start_date だけ）の中
--   - 実施日の一覧（ws_dates）が効くイベント（ワークショップありの複数日・配列）なら、その中にある
CREATE OR REPLACE FUNCTION public.ws_is_workshop_day(p_event events, p_day text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    -- どの部分が NULL でも結果が NULL にならないよう、COALESCE で false にそろえる
    -- （ws_dates が NULL のとき jsonb_typeof は NULL を返すので、そのまま比べると式全体が NULL になる）
    SELECT COALESCE(
        COALESCE(p_event.has_workshop, false)
        AND p_day IS NOT NULL
        AND p_day >= p_event.start_date::text
        AND p_day <= COALESCE(p_event.end_date, p_event.start_date)::text
        AND (
            NOT COALESCE(p_event.end_date IS NOT NULL AND p_event.end_date > p_event.start_date
                         AND jsonb_typeof(p_event.ws_dates) = 'array', false)
            OR COALESCE(p_event.ws_dates ? p_day, false)
        ),
        false
    );
$$;

-- ============================================================
-- 5. イベント本体と時間枠をまとめて保存する関数
-- ============================================================

-- 引数:
--   p_event_id ... 対象イベントの ID。NULL ならイベントを新しく作る（p_event が必要）
--   p_event    ... イベント本体の列（JSON。バックエンドが検証・整形したもの）。NULL ならイベント本体は変えない。
--                  キー ws_dates が無ければ、ws_dates は今の値のまま（古い画面が ws_dates を送らなかったとき）
--   p_sessions ... 時間枠の一覧（JSON の配列。各要素 {id?, time_label, max_participants, session_date}。
--                  並びが表示順）。NULL なら今の枠をそのまま入力として扱い、下の確認（日付・予約の付け替え）まで行う
-- 戻り値: イベントの ID
--
-- 流れ（どこかで例外が出たら、PostgREST がこの呼び出しのトランザクションごと取り消すので、何も残らない）:
--   1. 更新なら、保存前のイベントの行を FOR NO KEY UPDATE で取って控える（無ければ P0404）。
--      イベントを作る・更新する（p_event があるとき）
--      （FOR UPDATE にしないのは、予約の追加のトリガーの FOR KEY SHARE を待たせないため）
--   2. 保存後のイベントの行を読み直す
--   3. 保存後の実施日（ws_dates）を確かめる（空の配列・開催期間の外は P0422）
--   4. 既存の時間枠を FOR UPDATE で取り（予約の追加のトリガーの FOR SHARE と順番がそろう）、今の形を控える。
--      p_sessions が NULL なら今の枠を入力にする。
--      時間枠の日付を確かめる（実施日のあるイベントは実施日のどれか、無いイベントは NULL）。違えば P0422
--   5. 送られた順に、既存の枠は更新・新しい枠は作成する
--      （突き合わせ: id が既存の枠にあればその枠、無ければ (表示名, 日付) が同じ既存の枠。
--        ただし、ほかの要素が id で指している枠は (表示名, 日付) では選ばない）
--   6. キャンセル以外の予約すべてを確かめ、保存後の枠へ付け替える（下の「付け替えの決まり」）。
--      移し先の無い予約があれば P0409（DETAIL に一覧の JSON）
--   7. 送られなかった枠を消す（予約は 6 で付け替え済みなので、外部キーの SET NULL に頼らない）
--   8. 枠ごとの予約済みの人数（reserved_count）を数え直す
--
-- 付け替えの決まり（キャンセル以外の予約 1 件ごと）:
--   0. 予約日が、保存後のイベントでワークショップを実施する日か（ws_is_workshop_day）を確かめる。
--      実施しない日になったら（保存前は実施する日だった）→ 移し先なし（409）。
--      保存前から実施しない日だった予約（前からある食い違った古いデータ）は、日付では止めず、下の枠の付け替えだけ行う
--      （関係の無い項目の修正まで止めないため）
--   1. 枠を指しておらず preferred_time も無い予約（枠0件の日の予約）は、そのまま残す
--   a. 今の枠が残り、その枠が予約日に使える（日付が NULL か予約日と同じ）なら、そのまま
--   b. そうでなければ、保存後の枠のうち、表示名が「今の枠の（保存前の）表示名」か「preferred_time」で、
--      予約日に使える枠へ移す（その日の枠を、全日程の枠より先に選ぶ）
--   c. 移し先が無いとき
--      - 枠を指している予約 → 移し先なし（409）
--      - 枠を指していない予約（preferred_time だけ）→ 保存前にその表示名・日付で数えられていた
--        （保存前の枠と表示名が同じで、その日に使えた）なら移し先なし（409）。
--        どの枠にも数えられていなかった予約（古い自由入力の時間など）はそのまま残す
--   移した予約は preferred_time も移し先の表示名にそろえる（次の付け替えの手がかり）
CREATE OR REPLACE FUNCTION public.save_event_schedule(p_event_id uuid, p_event jsonb, p_sessions jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    -- 対象イベントの ID（作成したときは新しい ID）
    v_event_id uuid := p_event_id;
    -- 保存前のイベントの行（更新のときだけ）と、あるかどうか
    v_old_event events%ROWTYPE;
    v_has_old boolean := false;
    -- 保存後のイベントの行（ロックを取って読んだもの）
    v_event events%ROWTYPE;
    -- 効き目のある実施日の一覧（NULL なら全日程）
    v_ws_dates jsonb;
    -- 時間枠の入力（p_sessions、または p_sessions が NULL のときの今の枠）と、今の枠を入力にしたか
    v_input jsonb;
    v_from_db boolean := false;
    -- 時間枠の日付が合わないときの文言
    v_date_error text;
    -- 保存前の時間枠（ID → {time_label, session_date}）
    v_old jsonb;
    -- 時間枠の入力の 1 件
    v_item jsonb;
    -- 時間枠の表示順
    v_idx integer := 0;
    -- 時間枠の ID（更新する既存の枠・作成した枠）
    v_sid uuid;
    -- 時間枠の入力の表示名・日付
    v_label text;
    v_date date;
    -- 残す（保存後にある）時間枠の ID の一覧
    v_keep uuid[] := '{}';
    -- 入力の id のうち、既存の枠にあるもの（(表示名, 日付) の突き合わせで、ほかの行に取られないようにする）
    v_ref uuid[] := '{}';
    -- 確かめる予約 1 件
    v_r record;
    -- 予約の今の枠の、保存前の表示名
    v_old_label text;
    -- 移し先の枠の ID と表示名
    v_target uuid;
    v_target_label text;
    -- 移し先の無い予約（1 件ごと）と、日時ごとにまとめたもの
    v_conflicts jsonb := '[]'::jsonb;
    v_conflict_summary jsonb;
BEGIN
    -- 1. 保存前のイベントを控え、イベントを作る・更新する
    IF v_event_id IS NOT NULL THEN
        SELECT * INTO v_old_event FROM events WHERE id = v_event_id FOR NO KEY UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0404';
        END IF;
        v_has_old := true;
    END IF;
    IF p_event IS NOT NULL THEN
        IF v_event_id IS NULL THEN
            INSERT INTO events (
                name, slug, start_date, end_date, "time", location, booth_number, address, official_url,
                brands, has_workshop, ws_requires_reservation, daily_times, ws_dates, is_past
            ) VALUES (
                p_event->>'name', p_event->>'slug', (p_event->>'start_date')::date,
                NULLIF(p_event->>'end_date', '')::date, p_event->>'time', p_event->>'location',
                p_event->>'booth_number', p_event->>'address', p_event->>'official_url',
                ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_event->'brands', '[]'::jsonb))),
                COALESCE((p_event->>'has_workshop')::boolean, false),
                COALESCE((p_event->>'ws_requires_reservation')::boolean, true),
                NULLIF(p_event->'daily_times', 'null'::jsonb), NULLIF(p_event->'ws_dates', 'null'::jsonb),
                COALESCE((p_event->>'is_past')::boolean, false)
            ) RETURNING id INTO v_event_id;
        ELSE
            UPDATE events SET
                name = p_event->>'name',
                slug = p_event->>'slug',
                start_date = (p_event->>'start_date')::date,
                end_date = NULLIF(p_event->>'end_date', '')::date,
                "time" = p_event->>'time',
                location = p_event->>'location',
                booth_number = p_event->>'booth_number',
                address = p_event->>'address',
                official_url = p_event->>'official_url',
                brands = ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_event->'brands', '[]'::jsonb))),
                has_workshop = COALESCE((p_event->>'has_workshop')::boolean, false),
                ws_requires_reservation = COALESCE((p_event->>'ws_requires_reservation')::boolean, true),
                daily_times = NULLIF(p_event->'daily_times', 'null'::jsonb),
                -- キー ws_dates が無ければ今の値のまま
                ws_dates = CASE WHEN p_event ? 'ws_dates' THEN NULLIF(p_event->'ws_dates', 'null'::jsonb) ELSE ws_dates END,
                is_past = COALESCE((p_event->>'is_past')::boolean, false)
            WHERE id = v_event_id;
        END IF;
    ELSIF v_event_id IS NULL THEN
        RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0404';
    END IF;

    -- 2. 保存後のイベントの行を読み直す（ロックは 1 で取ってある。作成したときはここで取る）
    SELECT * INTO v_event FROM events WHERE id = v_event_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0404';
    END IF;

    -- 3. 実施日を確かめる。実施日はワークショップありの複数日イベントで、配列のときだけ効く
    IF v_event.has_workshop AND v_event.end_date IS NOT NULL AND v_event.end_date > v_event.start_date
       AND jsonb_typeof(v_event.ws_dates) = 'array' THEN
        IF jsonb_array_length(v_event.ws_dates) = 0 THEN
            RAISE EXCEPTION '実施日を1日以上選んでください' USING ERRCODE = 'P0422';
        END IF;
        IF EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_event.ws_dates) AS d
             WHERE jsonb_typeof(d) <> 'string'
                OR d #>> '{}' < v_event.start_date::text
                OR d #>> '{}' > v_event.end_date::text
        ) THEN
            RAISE EXCEPTION 'ワークショップの実施日が開催期間の外です' USING ERRCODE = 'P0422';
        END IF;
        v_ws_dates := v_event.ws_dates;
    END IF;

    -- 4. 既存の時間枠をロックし、保存前の形（表示名・日付）を控える。入力の枠を決めて、日付を確かめる
    PERFORM 1 FROM ws_sessions WHERE event_id = v_event_id FOR UPDATE;
    SELECT COALESCE(jsonb_object_agg(id::text, jsonb_build_object('time_label', time_label, 'session_date', session_date)),
                    '{}'::jsonb)
      INTO v_old
      FROM ws_sessions WHERE event_id = v_event_id;
    IF p_sessions IS NULL THEN
        -- 時間枠が送られなかったら、今の枠（表示順）をそのまま入力にする
        v_from_db := true;
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id::text, 'time_label', time_label,
                                                     'max_participants', max_participants, 'session_date', session_date)
                                  ORDER BY display_order, id), '[]'::jsonb)
          INTO v_input
          FROM ws_sessions WHERE event_id = v_event_id;
    ELSE
        v_input := p_sessions;
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_input) LOOP
        v_date := NULLIF(v_item->>'session_date', '')::date;
        v_date_error := NULL;
        IF v_ws_dates IS NULL AND v_date IS NOT NULL THEN
            v_date_error := 'このイベントは全日程でワークショップを実施するため、時間枠に日付は指定できません';
        ELSIF v_ws_dates IS NOT NULL AND (v_date IS NULL OR NOT (v_ws_dates ? v_date::text)) THEN
            v_date_error := '時間枠ごとにワークショップの実施日を指定してください';
        END IF;
        IF v_date_error IS NOT NULL THEN
            IF v_from_db THEN
                -- 今の枠が、変えた実施日と合わなくなった
                v_date_error := '時間枠の日付がワークショップの実施日と合わなくなります。時間枠も一緒に保存してください';
            END IF;
            RAISE EXCEPTION '%', v_date_error USING ERRCODE = 'P0422';
        END IF;
    END LOOP;

    -- 5. 入力の順に、既存の枠を更新・新しい枠を作成する
    --    先に、入力の id のうち既存の枠にあるものを控える（v_old のキーは必ず UUID なので、
    --    jsonb_each のキーから型を変えれば、UUID でない id が送られても型の変換で失敗しない）
    SELECT COALESCE(array_agg(o.key::uuid), '{}') INTO v_ref
      FROM jsonb_each(v_old) AS o
     WHERE o.key IN (SELECT x->>'id' FROM jsonb_array_elements(v_input) AS x);
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_input) LOOP
        v_label := v_item->>'time_label';
        v_date := NULLIF(v_item->>'session_date', '')::date;
        v_sid := NULL;
        -- 5-1. id が既存の枠にあり、まだ使っていなければその枠
        SELECT o.key::uuid INTO v_sid
          FROM jsonb_each(v_old) AS o
         WHERE o.key = v_item->>'id'
           AND NOT (o.key::uuid = ANY (v_keep));
        -- 5-2. 無ければ、(表示名, 日付) が同じで、まだ使っておらず、ほかの要素が id で指していない既存の枠
        IF v_sid IS NULL THEN
            SELECT o.key::uuid INTO v_sid
              FROM jsonb_each(v_old) AS o
             WHERE o.value->>'time_label' = v_label
               AND (o.value->>'session_date') IS NOT DISTINCT FROM v_date::text
               AND NOT (o.key::uuid = ANY (v_keep))
               AND NOT (o.key::uuid = ANY (v_ref))
             LIMIT 1;
        END IF;
        IF v_sid IS NOT NULL THEN
            UPDATE ws_sessions
               SET time_label = v_label,
                   max_participants = COALESCE((v_item->>'max_participants')::integer, 10),
                   display_order = v_idx,
                   session_date = v_date
             WHERE id = v_sid;
        ELSE
            INSERT INTO ws_sessions (event_id, time_label, max_participants, display_order, session_date)
            VALUES (v_event_id, v_label, COALESCE((v_item->>'max_participants')::integer, 10), v_idx, v_date)
            RETURNING id INTO v_sid;
        END IF;
        v_keep := v_keep || v_sid;
        v_idx := v_idx + 1;
    END LOOP;

    -- 6. キャンセル以外の予約すべてを確かめ、保存後の枠へ付け替える
    FOR v_r IN
        SELECT id, session_id, preferred_time, preferred_date, participants
          FROM workshop_reservations
         WHERE event_id = v_event_id
           AND status IS DISTINCT FROM 'cancelled'
         FOR UPDATE
    LOOP
        v_old_label := v_old -> (v_r.session_id::text) ->> 'time_label';
        -- 6-0. 予約日が、保存後も実施する日か（保存前は実施する日だったのに、実施しない日になったら移し先なし）
        IF NOT public.ws_is_workshop_day(v_event, v_r.preferred_date)
           AND v_has_old AND public.ws_is_workshop_day(v_old_event, v_r.preferred_date) THEN
            v_conflicts := v_conflicts || jsonb_build_object(
                'date', v_r.preferred_date,
                'time_label', COALESCE(v_old_label, v_r.preferred_time),
                'participants', COALESCE(v_r.participants, 1)
            );
            CONTINUE;
        END IF;
        -- 6-1. 枠を指しておらず、希望の時間も無い予約（枠0件の日の予約）はそのまま残す
        IF v_r.session_id IS NULL AND v_r.preferred_time IS NULL THEN
            CONTINUE;
        END IF;
        v_target := NULL;
        v_target_label := NULL;
        -- 6-a. 今の枠が残り、予約日に使えるならそのまま
        IF v_r.session_id IS NOT NULL AND v_r.session_id = ANY (v_keep) THEN
            SELECT id, time_label INTO v_target, v_target_label
              FROM ws_sessions
             WHERE id = v_r.session_id
               AND (session_date IS NULL OR session_date::text = v_r.preferred_date);
        END IF;
        -- 6-b. 表示名（今の枠の保存前の表示名・preferred_time）と予約日で使える枠を探す
        IF v_target IS NULL THEN
            SELECT id, time_label INTO v_target, v_target_label
              FROM ws_sessions
             WHERE id = ANY (v_keep)
               AND time_label IN (v_old_label, v_r.preferred_time)
               AND (session_date IS NULL OR session_date::text = v_r.preferred_date)
             ORDER BY (session_date IS NULL), (time_label = v_old_label) DESC NULLS LAST, display_order
             LIMIT 1;
        END IF;
        IF v_target IS NOT NULL THEN
            -- 6-c. 移し先へ付け替える（同じなら書き込まない）。トリガーがもう一度確かめる
            IF v_r.session_id IS DISTINCT FROM v_target OR v_r.preferred_time IS DISTINCT FROM v_target_label THEN
                UPDATE workshop_reservations
                   SET session_id = v_target, preferred_time = v_target_label
                 WHERE id = v_r.id;
            END IF;
        ELSIF v_r.session_id IS NOT NULL
              OR EXISTS (
                  SELECT 1 FROM jsonb_each(v_old) AS o
                   WHERE o.value->>'time_label' = v_r.preferred_time
                     AND ((o.value->>'session_date') IS NULL OR o.value->>'session_date' = v_r.preferred_date)
              ) THEN
            -- 6-d. 移し先が無い（保存前は枠に数えられていた）予約を控える
            v_conflicts := v_conflicts || jsonb_build_object(
                'date', v_r.preferred_date,
                'time_label', COALESCE(v_old_label, v_r.preferred_time),
                'participants', COALESCE(v_r.participants, 1)
            );
        END IF;
    END LOOP;

    -- 6-e. 移し先の無い予約があれば、日時ごとにまとめて例外にする（ここまでの変更はすべて取り消される）
    IF jsonb_array_length(v_conflicts) > 0 THEN
        SELECT jsonb_agg(jsonb_build_object('date', t.d, 'time_label', t.l, 'count', t.c, 'participants', t.p)
                         ORDER BY t.d NULLS FIRST, t.l NULLS FIRST)
          INTO v_conflict_summary
          FROM (
              SELECT x->>'date' AS d, x->>'time_label' AS l, count(*) AS c, sum((x->>'participants')::integer) AS p
                FROM jsonb_array_elements(v_conflicts) AS x
               GROUP BY 1, 2
          ) AS t;
        RAISE EXCEPTION 'reservation_conflict' USING ERRCODE = 'P0409', DETAIL = v_conflict_summary::text;
    END IF;

    -- 7. 入力に無かった枠を消す
    DELETE FROM ws_sessions WHERE event_id = v_event_id AND NOT (id = ANY (v_keep));

    -- 8. 枠ごとの予約済みの人数を数え直す（キャンセルを除く・全日程の合計）
    UPDATE ws_sessions s
       SET reserved_count = COALESCE((
               SELECT sum(COALESCE(r.participants, 1)) FROM workshop_reservations r
                WHERE r.session_id = s.id AND r.status IS DISTINCT FROM 'cancelled'
           ), 0)
     WHERE s.event_id = v_event_id;

    RETURN v_event_id;
END;
$$;

-- ============================================================
-- 6. 予約の状態をキャンセル以外に変える関数（キャンセルからの戻しを含む）
-- ============================================================

-- 引数: p_reservation_id ... 予約の ID、p_status ... 変えたあとの状態（'pending' か 'confirmed'）
-- 戻り値: 更新後の予約の行（JSON）
--
-- バックエンドは、キャンセル以外への状態の変更を、前に読んだ状態にかかわらず必ずこの関数で行う。
-- ロックを取ったあとの状態で判断する: もともとキャンセルでなければ、確かめずに状態だけを変える。
-- キャンセルからなら、下の確認をしてから戻す（読み取りと更新のあいだに別のリクエストがキャンセルしても、
-- 満席などの確認をすり抜けない）。
--
-- ロックの順番を「イベント → 枠 → 予約」にそろえる（日程の保存 save_event_schedule・イベントの削除と同じ向き）。
-- 予約の行を先にロックしてからトリガーの中で枠を待つと、枠を消す日程の保存（枠のロック → 外部キーの SET NULL で
-- 予約の行を待つ）と互いに待って行き詰まるため、UPDATE の前にこの順でロックを取る。
--
-- 流れ:
--   1. 予約を（ロックせずに）読み、イベントと枠の ID を知る（無ければ P0404）
--   2. イベントの行を FOR SHARE で取る（日程の保存と 1 つずつ通る）
--   3. 枠があれば、枠の行を FOR SHARE で取る
--   4. 予約の行を FOR UPDATE で取って読み直す。
--      すでにキャンセルでなければ（同時に戻された）、状態だけを変えて返す。
--      枠が消えていたら（外部キーの SET NULL）、枠の無い予約として確かめる
--   5. 確かめる（違えば例外を出し、何も変えない）
--      - ワークショップのあるイベントで、予約日が実施する日でない → P0412
--      - 枠を指しているのに枠が無い・別のイベントの枠 → P0411
--      - 枠を指していない（枠を消されたものも）のに、その日に使える枠がある → P0411（当日参加 is_walkin は通す）
--        （予約の API の「その日に枠があれば枠の指定が必須」と同じ決まり）
--      - 枠に日付があり、予約日と違う → P0410
--      - 枠が満席（アプリの満席の確認と同じ数え方: 同じイベントのキャンセル以外の予約で、予約日が同じもの
--        （予約日が空なら全日程）のうち、その枠を指すもの、または枠を指さず希望の時間が枠の表示名と同じもの）→ P0413
--   6. 状態を変えて、更新後の行を返す（目印 app.reservation_reinstate を立てて UPDATE する。トリガーももう一度確かめる。
--      ロックは取ってあるので待たない）
CREATE OR REPLACE FUNCTION public.reinstate_reservation(p_reservation_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    -- ロックを取る前に読んだ予約と、ロックを取って読み直した予約
    v_pre workshop_reservations%ROWTYPE;
    v_r workshop_reservations%ROWTYPE;
    -- 予約のイベントの行
    v_event events%ROWTYPE;
    -- 予約が指している時間枠の行（無ければすべて NULL）
    v_session ws_sessions%ROWTYPE;
    -- その枠に入っている人数（この予約を除く）
    v_used integer;
BEGIN
    -- 0. 変えたあとの状態はキャンセル以外
    IF p_status IS NULL OR p_status = 'cancelled' THEN
        RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0422';
    END IF;
    -- 1. 予約を読む
    SELECT * INTO v_pre FROM workshop_reservations WHERE id = p_reservation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservation_not_found' USING ERRCODE = 'P0404';
    END IF;
    -- 2. イベントの行を取る
    SELECT * INTO v_event FROM events WHERE id = v_pre.event_id FOR SHARE;
    -- 3. 枠の行を取る
    IF v_pre.session_id IS NOT NULL THEN
        SELECT * INTO v_session FROM ws_sessions WHERE id = v_pre.session_id FOR SHARE;
    END IF;
    -- 4. 予約の行を取って読み直す
    SELECT * INTO v_r FROM workshop_reservations WHERE id = p_reservation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'reservation_not_found' USING ERRCODE = 'P0404';
    END IF;
    IF v_r.status IS DISTINCT FROM 'cancelled' THEN
        -- キャンセルでない（もともと受付済・同時に戻された）: 状態だけを変える（キャンセル以外どうしの変更なので
        -- トリガーは確かめない）
        UPDATE workshop_reservations SET status = p_status WHERE id = p_reservation_id RETURNING * INTO v_r;
        RETURN to_jsonb(v_r);
    END IF;
    IF v_r.session_id IS DISTINCT FROM v_pre.session_id THEN
        -- 枠が消されて SET NULL になった（キャンセル済みの予約は付け替えないので、ほかの値にはならない）
        IF v_r.session_id IS NOT NULL THEN
            RAISE EXCEPTION 'reservation_session_invalid' USING ERRCODE = 'P0411';
        END IF;
        v_session := NULL;
    END IF;
    -- 5. 確かめる
    IF v_event.has_workshop AND v_r.preferred_date IS NOT NULL
       AND NOT public.ws_is_workshop_day(v_event, v_r.preferred_date) THEN
        RAISE EXCEPTION 'reservation_not_workshop_day' USING ERRCODE = 'P0412';
    END IF;
    -- 枠の無い予約（枠を消されたものも）は、その日に使える枠があれば戻さない（予約の API の「その日に枠があれば
    -- 枠の指定が必須」と同じ決まり。枠の無いまま戻すと、満席の確認から漏れるため）
    IF v_r.session_id IS NULL AND NOT COALESCE(v_r.is_walkin, false) AND v_event.has_workshop AND v_r.preferred_date IS NOT NULL
       AND EXISTS (SELECT 1 FROM ws_sessions
                    WHERE event_id = v_r.event_id
                      AND (session_date IS NULL OR session_date::text = v_r.preferred_date)) THEN
        RAISE EXCEPTION 'reservation_session_required' USING ERRCODE = 'P0411';
    END IF;
    IF v_r.session_id IS NOT NULL THEN
        IF v_session.id IS NULL OR v_session.event_id IS DISTINCT FROM v_r.event_id THEN
            RAISE EXCEPTION 'reservation_session_invalid' USING ERRCODE = 'P0411';
        END IF;
        IF v_session.session_date IS NOT NULL
           AND v_session.session_date::text IS DISTINCT FROM v_r.preferred_date THEN
            RAISE EXCEPTION 'reservation_session_date_mismatch' USING ERRCODE = 'P0410';
        END IF;
        SELECT COALESCE(sum(COALESCE(participants, 1)), 0) INTO v_used
          FROM workshop_reservations
         WHERE event_id = v_r.event_id
           AND status <> 'cancelled'
           AND id <> v_r.id
           AND (v_r.preferred_date IS NULL OR preferred_date = v_r.preferred_date)
           AND (session_id = v_session.id OR (session_id IS NULL AND preferred_time = v_session.time_label));
        IF v_used + COALESCE(v_r.participants, 1) > v_session.max_participants THEN
            RAISE EXCEPTION 'session_full' USING ERRCODE = 'P0413';
        END IF;
    END IF;
    -- 6. 状態を変えて返す。トリガーがキャンセルからの戻しを認めるよう、このトランザクションの中だけ目印を立てる
    PERFORM set_config('app.reservation_reinstate', 'on', true);
    UPDATE workshop_reservations SET status = p_status WHERE id = p_reservation_id RETURNING * INTO v_r;
    PERFORM set_config('app.reservation_reinstate', 'off', true);
    RETURN to_jsonb(v_r);
END;
$$;

-- ============================================================
-- 7. 権限
-- ============================================================

-- 7-1. バックエンド（service_role）が新しい列を読み書きできるようにする（006 のポリシーに加えて権限を明示する）
GRANT ALL ON public.ws_sessions TO service_role;
GRANT ALL ON public.events TO service_role;

-- 7-2. 関数はバックエンドだけが呼べるようにする（PostgreSQL は既定で PUBLIC に実行権限を付けるため取り消す）
REVOKE EXECUTE ON FUNCTION public.save_event_schedule(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_event_schedule(uuid, jsonb, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_reservation_session() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ws_is_workshop_day(events, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ws_is_workshop_day(events, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reinstate_reservation(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reinstate_reservation(uuid, text) TO service_role;

COMMIT;

-- 8. Supabase の API に列と関数の追加を知らせる
NOTIFY pgrst, 'reload schema';
