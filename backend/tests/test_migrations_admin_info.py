"""
管理情報を専用テーブルに移すマイグレーション SQL（016・017）の簡易チェック。

DB には接続せず、SQL ファイルを文字列として読み、
未ログイン（anon）から管理情報が読めない設定になっているかを確かめる。
"""
import re
from pathlib import Path

# マイグレーション SQL を置いているフォルダ（backend/migrations）
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / 'migrations'


def _read_sql(filename: str) -> str:
    """マイグレーション SQL を読み、コメント行（-- 以降）を取り除いた本文を返す。

    Args:
        filename: migrations フォルダ内のファイル名

    Returns:
        コメントを除いた SQL 本文（大文字小文字はそのまま）
    """
    # 1. ファイルを読む
    text = (MIGRATIONS_DIR / filename).read_text(encoding='utf-8')
    # 2. 行ごとに「--」以降（コメント）を取り除く。説明文の言葉に反応しないようにするため
    return '\n'.join(line.split('--', 1)[0] for line in text.splitlines())


class TestMigration016EventAdminInfo:
    """016_event_admin_info.sql（専用テーブルの作成とデータの写し）のチェック。"""

    def test_016_専用テーブルをevent_id主キーとeventsへのON_DELETE_CASCADEで作る(self):
        """event_admin_info を event_id（events 参照・削除連動）主キー・info jsonb・updated_at で作る。"""
        sql = _read_sql('016_event_admin_info.sql')
        norm = re.sub(r'\s+', ' ', sql).upper()
        assert 'CREATE TABLE IF NOT EXISTS EVENT_ADMIN_INFO' in norm
        assert 'EVENT_ID UUID PRIMARY KEY REFERENCES EVENTS(ID) ON DELETE CASCADE' in norm
        assert 'INFO JSONB' in norm
        assert 'UPDATED_AT TIMESTAMPTZ' in norm

    def test_016_RLSが有効になっている(self):
        """event_admin_info に ENABLE ROW LEVEL SECURITY がかかっている。"""
        norm = re.sub(r'\s+', ' ', _read_sql('016_event_admin_info.sql')).upper()
        assert 'ALTER TABLE EVENT_ADMIN_INFO ENABLE ROW LEVEL SECURITY' in norm

    def test_016_anonやauthenticated向けのポリシーが無くservice_roleだけ(self):
        """作成するポリシーはすべて TO service_role で、anon・authenticated・public 向けのものが無い。"""
        sql = _read_sql('016_event_admin_info.sql')
        norm = re.sub(r'\s+', ' ', sql).lower()
        # 1. CREATE POLICY 文を取り出す
        policies = re.findall(r'create policy [^;]*;', norm)
        assert policies, 'CREATE POLICY が1つも無い'
        # 2. どのポリシーも service_role だけが対象
        for p in policies:
            assert 'to service_role' in p, f'service_role 以外向けのポリシーがある: {p}'
        # 3. anon・authenticated・public という対象がどこにも出てこない
        assert not re.search(r'\bto\s+(anon|authenticated|public)\b', norm)
        assert not re.search(r'\bgrant\b[^;]*\bto\s+(anon|authenticated|public)\b', norm)

    def test_016_既存データを上書きせずに写す(self):
        """events.admin_info を event_admin_info に写し、既にある行は上書きしない（ON CONFLICT DO NOTHING）。"""
        norm = re.sub(r'\s+', ' ', _read_sql('016_event_admin_info.sql')).upper()
        assert 'INSERT INTO EVENT_ADMIN_INFO (EVENT_ID, INFO)' in norm
        assert 'ON CONFLICT (EVENT_ID) DO NOTHING' in norm

    def test_016_events_admin_info列は削除しない(self):
        """016 は今の本番を壊さないよう events.admin_info を削除しない（削除は 017）。"""
        norm = re.sub(r'\s+', ' ', _read_sql('016_event_admin_info.sql')).upper()
        assert 'DROP COLUMN' not in norm


class TestMigration017DropEventsAdminInfo:
    """017_drop_events_admin_info.sql（events.admin_info 列の削除）のチェック。"""

    def test_017_events_admin_info列をIF_EXISTSで削除する(self):
        """events テーブルの admin_info 列を DROP COLUMN IF EXISTS で削除する。"""
        norm = re.sub(r'\s+', ' ', _read_sql('017_drop_events_admin_info.sql')).upper()
        assert 'ALTER TABLE EVENTS DROP COLUMN IF EXISTS ADMIN_INFO' in norm

    def test_017_削除前にまだ写していない管理情報を写す(self):
        """017 は列の削除より前に、未移行の管理情報を上書きせずに写す。"""
        norm = re.sub(r'\s+', ' ', _read_sql('017_drop_events_admin_info.sql')).upper()
        insert_pos = norm.find('INSERT INTO EVENT_ADMIN_INFO')
        drop_pos = norm.find('DROP COLUMN IF EXISTS ADMIN_INFO')
        assert insert_pos != -1
        assert 'ON CONFLICT (EVENT_ID) DO NOTHING' in norm
        assert insert_pos < drop_pos


def _norm(filename: str) -> str:
    """SQL をコメント抜き・空白1つ・大文字にそろえて返す（位置や並び順の確認用）。

    Args:
        filename: migrations フォルダ内のファイル名

    Returns:
        正規化した SQL 本文
    """
    return re.sub(r'\s+', ' ', _read_sql(filename)).upper()


def _tx_range(norm: str) -> tuple[int, int]:
    """トランザクション開始（行頭の BEGIN;）と終了（COMMIT;）の位置を返す。

    plpgsql 関数の本文にも BEGIN があるため、「BEGIN;」（セミコロン付き）だけを開始として扱う。

    Args:
        norm: _norm で正規化した SQL

    Returns:
        (BEGIN; の位置, COMMIT; の位置)。無ければ -1
    """
    return norm.find('BEGIN;'), norm.rfind('COMMIT;')


class TestMigration016Safety:
    """016 の二重の守り（REVOKE）・切り替え中の取りこぼし防止（トリガー）・トランザクション・API への通知のチェック。"""

    def test_016_anonとauthenticatedの権限をREVOKEする(self):
        """REVOKE ALL ON event_admin_info FROM ... に anon と authenticated の両方が含まれる。"""
        norm = _norm('016_event_admin_info.sql')
        # 1. event_admin_info に対する REVOKE 文を取り出す
        revokes = re.findall(r'REVOKE ALL ON EVENT_ADMIN_INFO FROM ([^;]*);', norm)
        assert revokes, 'event_admin_info の REVOKE が無い'
        # 2. 対象のロールに anon と authenticated が両方入っている
        roles = {r.strip() for stmt in revokes for r in stmt.split(',')}
        assert 'ANON' in roles
        assert 'AUTHENTICATED' in roles

    def test_016_トリガーがeventsのadmin_infoのINSERTとUPDATEで動く(self):
        """trg_sync_event_admin_info が AFTER INSERT OR UPDATE OF admin_info ON events FOR EACH ROW で関数を呼ぶ。"""
        norm = _norm('016_event_admin_info.sql')
        m = re.search(r'CREATE TRIGGER TRG_SYNC_EVENT_ADMIN_INFO ([^;]*);', norm)
        assert m, 'トリガー trg_sync_event_admin_info を作っていない'
        body = m.group(1)
        assert 'AFTER INSERT OR UPDATE OF ADMIN_INFO ON EVENTS' in body
        assert 'FOR EACH ROW' in body
        assert 'EXECUTE FUNCTION SYNC_EVENT_ADMIN_INFO_FROM_EVENTS()' in body
        # 作り直せるよう、作成前に同名トリガーを消している
        assert norm.find('DROP TRIGGER IF EXISTS TRG_SYNC_EVENT_ADMIN_INFO ON EVENTS') < m.start()

    def test_016_トリガー関数は空でない管理情報を後から書いた内容で上書きする(self):
        """関数本文が admin_info の空チェックをし、ON CONFLICT (event_id) DO UPDATE で info と updated_at を上書きする。"""
        norm = _norm('016_event_admin_info.sql')
        # 1. 関数定義の $$ ... $$ の本文を取り出す
        m = re.search(r'CREATE OR REPLACE FUNCTION SYNC_EVENT_ADMIN_INFO_FROM_EVENTS\(\).*?\$\$(.*?)\$\$', norm)
        assert m, '関数 sync_event_admin_info_from_events を作っていない'
        body = m.group(1)
        # 2. 空でないときだけ写す
        assert "NEW.ADMIN_INFO IS NOT NULL AND NEW.ADMIN_INFO <> '{}'::JSONB" in body
        # 3. 上書きの upsert（DO NOTHING ではない）
        assert 'INSERT INTO EVENT_ADMIN_INFO' in body
        assert 'ON CONFLICT (EVENT_ID) DO UPDATE SET INFO = EXCLUDED.INFO' in body
        assert 'UPDATED_AT = NOW()' in body
        assert 'DO NOTHING' not in body
        assert 'RETURN NEW' in body

    def test_016_BEGINとCOMMITで囲まれている(self):
        """テーブル作成からトリガー作成までが BEGIN; 〜 COMMIT; の中にある。"""
        norm = _norm('016_event_admin_info.sql')
        begin, commit = _tx_range(norm)
        assert begin != -1 and commit != -1 and begin < commit
        for stmt in ('CREATE TABLE IF NOT EXISTS EVENT_ADMIN_INFO',
                     'ENABLE ROW LEVEL SECURITY',
                     'REVOKE ALL ON EVENT_ADMIN_INFO',
                     'INSERT INTO EVENT_ADMIN_INFO (EVENT_ID, INFO)',
                     'CREATE TRIGGER TRG_SYNC_EVENT_ADMIN_INFO'):
            pos = norm.find(stmt)
            assert begin < pos < commit, f'トランザクションの外にある: {stmt}'

    def test_016_NOTIFY_pgrstでスキーマ再読み込みを知らせる(self):
        """NOTIFY pgrst, 'reload schema' がある。"""
        assert "NOTIFY PGRST, 'RELOAD SCHEMA';" in _norm('016_event_admin_info.sql')


class TestMigration017Safety:
    """017 の実行順（トリガー削除 → 再写し → 列削除）・トランザクション・API への通知のチェック。"""

    def test_017_トリガーと関数の削除が列の削除より前にある(self):
        """DROP TRIGGER / DROP FUNCTION（IF EXISTS）が DROP COLUMN より前にある。"""
        norm = _norm('017_drop_events_admin_info.sql')
        drop_trg = norm.find('DROP TRIGGER IF EXISTS TRG_SYNC_EVENT_ADMIN_INFO ON EVENTS')
        drop_fn = norm.find('DROP FUNCTION IF EXISTS SYNC_EVENT_ADMIN_INFO_FROM_EVENTS()')
        drop_col = norm.find('DROP COLUMN IF EXISTS ADMIN_INFO')
        assert drop_trg != -1 and drop_fn != -1 and drop_col != -1
        assert drop_trg < drop_col
        assert drop_fn < drop_col
        # トリガーは関数を使っているので、トリガーを先に消す
        assert drop_trg < drop_fn

    def test_017_再写しはトリガー削除の後で列の削除より前にある(self):
        """INSERT INTO event_admin_info（DO NOTHING）がトリガー削除の後・DROP COLUMN の前にある。"""
        norm = _norm('017_drop_events_admin_info.sql')
        drop_trg = norm.find('DROP TRIGGER IF EXISTS TRG_SYNC_EVENT_ADMIN_INFO')
        insert_pos = norm.find('INSERT INTO EVENT_ADMIN_INFO')
        drop_col = norm.find('DROP COLUMN IF EXISTS ADMIN_INFO')
        assert drop_trg < insert_pos < drop_col
        assert 'ON CONFLICT (EVENT_ID) DO NOTHING' in norm[insert_pos:drop_col]

    def test_017_BEGINとCOMMITで囲まれている(self):
        """トリガー削除・再写し・列削除がすべて BEGIN; 〜 COMMIT; の中にある。"""
        norm = _norm('017_drop_events_admin_info.sql')
        begin, commit = _tx_range(norm)
        assert begin != -1 and commit != -1 and begin < commit
        for stmt in ('DROP TRIGGER IF EXISTS TRG_SYNC_EVENT_ADMIN_INFO',
                     'DROP FUNCTION IF EXISTS SYNC_EVENT_ADMIN_INFO_FROM_EVENTS()',
                     'INSERT INTO EVENT_ADMIN_INFO',
                     'DROP COLUMN IF EXISTS ADMIN_INFO'):
            pos = norm.find(stmt)
            assert begin < pos < commit, f'トランザクションの外にある: {stmt}'

    def test_017_NOTIFY_pgrstでスキーマ再読み込みを知らせる(self):
        """NOTIFY pgrst, 'reload schema' がある。"""
        assert "NOTIFY PGRST, 'RELOAD SCHEMA';" in _norm('017_drop_events_admin_info.sql')


class TestMigration018GrantServiceRole:
    """018_grant_event_admin_info.sql（サーバーへの読み書き権限の付与）のチェック。"""

    def test_018_service_roleに読み書きの権限を付ける(self):
        """GRANT の対象が service_role で、SELECT・INSERT・UPDATE・DELETE がそろっている。"""
        norm = _norm('018_grant_event_admin_info.sql')
        # 1. event_admin_info への GRANT 文を取り出す
        grants = re.findall(r'GRANT [^;]* ON EVENT_ADMIN_INFO TO [^;]*;', norm)
        assert grants, 'event_admin_info への GRANT が無い'
        # 2. 管理情報 API が使う操作（読む・作る・上書き）に必要な権限がそろっている
        for priv in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'):
            assert any(priv in g for g in grants), f'{priv} の権限が無い'
        # 3. 権限を付ける相手は service_role だけ
        for g in grants:
            assert g.endswith('TO SERVICE_ROLE;'), f'service_role 以外に権限を付けている: {g}'

    def test_018_anonやauthenticatedには権限を付けない(self):
        """未ログイン（anon）・ログイン済み（authenticated）・public への GRANT が無い。"""
        norm = _norm('018_grant_event_admin_info.sql')
        assert not re.search(r'\bGRANT\b[^;]*\bTO\b[^;]*\b(ANON|AUTHENTICATED|PUBLIC)\b', norm)

    def test_018_NOTIFY_pgrstでスキーマ再読み込みを知らせる(self):
        """NOTIFY pgrst, 'reload schema' がある。"""
        assert "NOTIFY PGRST, 'RELOAD SCHEMA';" in _norm('018_grant_event_admin_info.sql')
