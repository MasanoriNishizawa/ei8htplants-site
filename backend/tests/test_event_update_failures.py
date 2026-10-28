"""PUT /api/events/{uuid} の更新途中で失敗した場合の副作用順序を確認するテスト。"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import require_auth
from app.main import app


class _Query:
    """Supabase クエリの呼び出しを記録し、指定段階で失敗させる。"""

    def __init__(self, table_name: str, stage: str | None, operations: list[str], event: dict, exists_check: bool):
        """実行結果と失敗段階を持つクエリモックを初期化する。

        Args:
            table_name: 操作対象のテーブル名。
            stage: 失敗させる操作名。失敗させない場合は None。
            operations: 書き込みと公開読み直しの順序を記録する共有リスト。
            event: 存在確認と公開読み直しで返すイベント行。
            exists_check: このクエリが管理用イベント存在確認かどうか。

        Returns:
            なし。
        """
        # 変数の内容: table_name: クエリ対象、stage: 例外を発生させる段階、operations: 操作ログ、event: モック応答。
        self.table_name = table_name
        self.stage = stage
        self.operations = operations
        self.event = event
        self.exists_check = exists_check
        # 変数の内容: operation: このクエリが次に実行する読み書き操作名。
        self.operation: str | None = None
        # 変数の内容: single_requested: execute の応答を単一行の dict にする指定があったか。
        self.single_requested = False

    def select(self, *_args, **_kwargs):
        """読み取りクエリを設定して自分自身を返す。

        Args:
            *_args: Supabase の select に渡される位置引数。
            **_kwargs: Supabase の select に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 読み取り操作の種類を設定してクエリ連鎖を続ける。
        self.operation = 'select'
        return self

    def update(self, *_args, **_kwargs):
        """イベント更新クエリを設定して自分自身を返す。

        Args:
            *_args: Supabase の update に渡される更新データ。
            **_kwargs: Supabase の update に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. イベント更新を操作ログに使う名前で記録する。
        self.operation = 'event_update'
        return self

    def delete(self, *_args, **_kwargs):
        """イベント画像削除クエリを設定して自分自身を返す。

        Args:
            *_args: Supabase の delete に渡される位置引数。
            **_kwargs: Supabase の delete に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 画像削除を操作ログに使う名前で記録する。
        self.operation = 'image_delete'
        return self

    def insert(self, *_args, **_kwargs):
        """イベント画像挿入クエリを設定して自分自身を返す。

        Args:
            *_args: Supabase の insert に渡される挿入データ。
            **_kwargs: Supabase の insert に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 画像挿入を操作ログに使う名前で記録する。
        self.operation = 'image_insert'
        return self

    def eq(self, *_args, **_kwargs):
        """等価条件を受け取り、クエリ連鎖を続ける。

        Args:
            *_args: Supabase の eq に渡される列名と値。
            **_kwargs: Supabase の eq に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 条件指定自体では操作順を変えず、このモックを返す。
        return self

    def in_(self, *_args, **_kwargs):
        """IN 条件を受け取り、クエリ連鎖を続ける。

        Args:
            *_args: Supabase の in_ に渡される列名と値一覧。
            **_kwargs: Supabase の in_ に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 条件指定自体では操作順を変えず、このモックを返す。
        return self

    def single(self):
        """単一行取得を指定し、クエリ連鎖を続ける。

        Returns:
            次のクエリ実行を受け取るこのモック。
        """
        # 1. 単一行応答が必要なことを記録し、このモックを返す。
        self.single_requested = True
        return self

    def order(self, *_args, **_kwargs):
        """並び順指定を受け取り、クエリ連鎖を続ける。

        Args:
            *_args: Supabase の order に渡される列名。
            **_kwargs: Supabase の order に渡されるキーワード引数。

        Returns:
            次のクエリ指定を受け取るこのモック。
        """
        # 1. 条件指定自体では操作順を変えず、このモックを返す。
        return self

    def execute(self):
        """クエリを記録し、指定段階なら例外を発生させる。

        Returns:
            Supabase 応答を模した data 属性付きオブジェクト。

        Raises:
            RuntimeError: stage がこのクエリ操作と一致する場合。
        """
        # 1. 公開用の読み直しも含めて実行順を記録する。
        operation = self.operation
        if self.table_name == 'events' and operation == 'select':
            operation = 'event_exists' if self.exists_check else 'public_readback'
        if operation in {'event_update', 'image_delete', 'image_insert', 'public_readback'}:
            self.operations.append(operation)
        # 2. 指定された操作だけで失敗させ、以降の処理が止まることを確かめられるようにする。
        if operation == self.stage:
            raise RuntimeError(f'{operation} failure')
        # 3. Supabase の single() は dict、通常の一覧検索は list で応答する。
        if self.table_name != 'events':
            data = []
        elif self.single_requested:
            data = self.event
        else:
            data = [self.event]
        return MagicMock(data=data)


class _Supabase:
    """テーブル名に応じて段階記録クエリを返す Supabase モック。"""

    def __init__(self, stage: str | None, operations: list[str], event: dict, exists_check: bool):
        """Supabase モックの共有設定を保存する。

        Args:
            stage: 失敗させる操作名。
            operations: 書き込みと公開読み直しの順序を記録する共有リスト。
            event: イベントテーブルの応答データ。
            exists_check: 最初の events.select を存在確認として扱うかどうか。

        Returns:
            なし。
        """
        # 変数の内容: stage: 失敗対象、operations: 呼び出し記録、event: イベントの応答行。
        self.stage = stage
        self.operations = operations
        self.event = event
        self.exists_check = exists_check

    def table(self, table_name: str):
        """指定テーブル用のクエリモックを作る。

        Args:
            table_name: Supabase のテーブル名。

        Returns:
            select・update・delete・insert を受け取るクエリモック。
        """
        # 1. 管理用クライアントと公開用クライアントの役割を各クエリへ渡す。
        return _Query(table_name, self.stage, self.operations, self.event, self.exists_check and table_name == 'events')


class TestEventUpdateFailures:
    """イベント更新各段階の失敗時に後続操作が止まることを確かめる。"""

    def setup_method(self):
        """管理者認証をバイパスする。

        Returns:
            なし。
        """
        # 1. 既存のイベント管理テストと同じ方法で認証依存関係を置き換える。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """認証依存関係の上書きを消して他のテストへの影響を防ぐ。

        Returns:
            なし。
        """
        # 1. テスト後に共有 FastAPI アプリの依存関係を初期状態へ戻す。
        app.dependency_overrides.clear()

    def _put(self, stage: str) -> tuple[int, list[str]]:
        """指定段階で失敗する PUT を実行し、応答と操作順を返す。

        Args:
            stage: 失敗を注入する操作名。

        Returns:
            HTTP ステータスコードと記録された操作名の一覧。
        """
        # 変数の内容: event: 存在確認・公開読み直しで使うイベント行、operations: API 内の操作順ログ。
        event = {
            'id': '11111111-1111-1111-1111-111111111111',
            'slug': None,
            'name': '更新対象イベント',
            'start_date': '2099-01-01',
            'end_date': None,
            'location': '東京',
            'brands': [],
            'has_workshop': False,
        }
        operations: list[str] = []
        admin_sb = _Supabase(stage, operations, event, exists_check=True)
        public_sb = _Supabase(stage, operations, event, exists_check=False)
        # 1. DB クライアントをモックし、例外をHTTP応答にする設定で対象 API を呼ぶ。
        with patch('app.routes.events.admin_supabase', admin_sb), \
             patch('app.routes.events.supabase', public_sb):
            client = TestClient(app, raise_server_exceptions=False)
            response = client.put(
                f"/api/events/{event['id']}",
                json={
                    'name': '更新後イベント',
                    'start_date': '2099-01-01',
                    'location': '大阪',
                    'image_urls': ['https://example.com/event.jpg'],
                },
            )
        # 2. HTTP ステータスと副作用順ログだけを呼び出し元へ返す。
        return response.status_code, operations

    def test_イベント更新失敗時は画像削除と挿入を呼ばない(self):
        """イベント本体の更新失敗は 500 となり画像操作へ進まない。

        Returns:
            なし。
        """
        # 1. イベント更新に失敗を注入し、後続の画像操作が無いことを確認する。
        status, operations = self._put('event_update')

        assert status == 500
        assert operations == ['event_update']

    def test_画像削除失敗時は挿入を呼ばない(self):
        """画像削除失敗は 500 となり、先行更新だけが記録される。

        Returns:
            なし。
        """
        # 1. 画像削除に失敗を注入し、イベント更新後に挿入へ進まないことを確認する。
        status, operations = self._put('image_delete')

        assert status == 500
        assert operations == ['event_update', 'image_delete']

    def test_画像挿入失敗時は先行更新と削除のあと挿入を試みる(self):
        """画像挿入失敗は 500 となり、更新・削除後に挿入を試みたことを記録する。

        Returns:
            なし。
        """
        # 1. 画像挿入に失敗を注入し、現行処理順の書き込みログを確認する。
        status, operations = self._put('image_insert')

        assert status == 500
        assert operations == ['event_update', 'image_delete', 'image_insert']
