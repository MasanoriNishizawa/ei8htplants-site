"""PUT /api/events/{uuid} の失敗操作順とテスト用fake stateだけの遷移を確認する。"""

from unittest.mock import MagicMock, patch

import pytest

from fastapi.testclient import TestClient

from app.auth import require_auth
from app.main import app


class _Query:
    """Supabase クエリの呼び出しを記録し、指定段階で失敗させる。"""

    def __init__(self, table_name: str, stage: str | None, operations: list[str], event: dict, exists_check: bool, record_event_exists: bool):
        """実行結果と失敗段階を持つクエリモックを初期化する。

        Args:
            table_name: 操作対象のテーブル名。
            stage: 失敗させる操作名。失敗させない場合は None。
            operations: 書き込みと公開読み直しの順序を記録する共有リスト。
            event: 存在確認と公開読み直しで返すイベント行。
            exists_check: このクエリが管理用イベント存在確認かどうか。
            record_event_exists: True のとき存在確認の実行も操作ログに記録する。

        Returns:
            なし。
        """
        # 1. クエリの対象・失敗設定・共有ログをインスタンスへ保持する。
        # 変数の内容: table_name: クエリ対象、stage: 例外を発生させる段階、operations: 操作ログ、event: モック応答。
        self.table_name = table_name
        self.stage = stage
        self.operations = operations
        self.event = event
        self.exists_check = exists_check
        # 変数の内容: record_event_exists: 新しく追加する読み取り失敗テストだけで存在確認の順序も残す設定。
        self.record_event_exists = record_event_exists
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
        elif self.table_name == 'event_images' and operation == 'select':
            operation = 'image_readback'
        if operation in {'event_update', 'image_delete', 'image_insert', 'public_readback', 'image_readback'} or (
            operation == 'event_exists' and self.record_event_exists
        ):
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

    def __init__(self, stage: str | None, operations: list[str], event: dict, exists_check: bool, record_event_exists: bool = False):
        """Supabase モックの共有設定を保存する。

        Args:
            stage: 失敗させる操作名。
            operations: 書き込みと公開読み直しの順序を記録する共有リスト。
            event: イベントテーブルの応答データ。
            exists_check: 最初の events.select を存在確認として扱うかどうか。
            record_event_exists: True のとき存在確認の実行も操作ログに記録する。

        Returns:
            なし。
        """
        # 1. Supabase モック全体で共有する操作設定を保持する。
        # 変数の内容: stage: 失敗対象、operations: 呼び出し記録、event: イベントの応答行。
        self.stage = stage
        self.operations = operations
        self.event = event
        self.exists_check = exists_check
        # 変数の内容: record_event_exists: 既存ケースの操作ログ形式を保ちながら、読取経路の確認だけ存在確認を記録するフラグ。
        self.record_event_exists = record_event_exists

    def table(self, table_name: str):
        """指定テーブル用のクエリモックを作る。

        Args:
            table_name: Supabase のテーブル名。

        Returns:
            select・update・delete・insert を受け取るクエリモック。
        """
        # 1. 管理用クライアントと公開用クライアントの役割を各クエリへ渡す。
        return _Query(
            table_name,
            self.stage,
            self.operations,
            self.event,
            self.exists_check and table_name == 'events',
            self.record_event_exists,
        )


class _StatefulSupabaseFake:
    """共有stateへexecute成功時だけ反映する、テスト専用のSupabase fake。"""

    def __init__(self, state: dict, operations: list[str], failure_stage: str | None):
        """状態・操作ログ・失敗段階を各クエリfakeへ渡す。

        Args:
            state: イベントと画像のテスト用共有状態。
            operations: executeの呼出順を追跡するログ。
            failure_stage: executeの効果を適用する前に例外を出す段階。

        Returns:
            なし。
        """
        # 1. execute 成功時に更新する共有状態と失敗地点を保持する。
        # 変数の内容: state: fake内でのみ更新するイベント・画像、operations: execute履歴、failure_stage: 事前失敗地点。
        self.state = state
        self.operations = operations
        self.failure_stage = failure_stage

    def table(self, table_name: str):
        """指定テーブルを対象にするクエリfakeを生成する。

        Args:
            table_name: Supabaseのテーブル名。

        Returns:
            クエリ構築とexecuteを扱うstateful query fake。
        """
        # 1. 呼出元にテーブル名を保持した独立クエリfakeを返す。
        return _StatefulQuery(self.state, self.operations, self.failure_stage, table_name)


class _StatefulQuery:
    """クエリを組み立て、成功したexecuteだけをfake stateへ反映する。"""

    def __init__(self, state: dict, operations: list[str], failure_stage: str | None, table_name: str):
        """クエリの共有stateと操作対象を初期化する。

        Args:
            state: イベントと画像のテスト用共有状態。
            operations: execute順を残す共有ログ。
            failure_stage: 効果適用前に失敗させる段階。
            table_name: このクエリが対象にするテーブル。

        Returns:
            なし。
        """
        # 1. クエリの共有stateと操作対象を初期化する。
        # 変数の内容: state: fake state、operations: 操作ログ、failure_stage: 失敗注入箇所、table_name: 対象表。
        self.state = state
        self.operations = operations
        self.failure_stage = failure_stage
        self.table_name = table_name
        # 変数の内容: action/payload/filters/single_requested: クエリ操作・入力・絞込条件・単一行応答の指定。
        self.action: str | None = None
        self.payload = None
        self.filters: list[tuple[str, object]] = []
        self.single_requested = False

    def select(self, *_args, **_kwargs):
        """SELECTを指定してクエリfakeを返す。

        Args:
            *_args: Supabase selectへ渡す列指定。
            **_kwargs: Supabase selectへ渡す追加指定。

        Returns:
            クエリfake自身。
        """
        # 1. 読取操作として実行するよう指定する。
        self.action = 'select'
        return self

    def update(self, payload: dict, **_kwargs):
        """UPDATE内容を保持してクエリfakeを返す。

        Args:
            payload: eventsへ反映する更新データ。
            **_kwargs: Supabase updateへ渡す追加指定。

        Returns:
            クエリfake自身。
        """
        # 1. 成功時に適用するイベント更新項目を保持する。
        self.action = 'update'
        self.payload = payload
        return self

    def delete(self):
        """DELETE操作を指定してクエリfakeを返す。

        Returns:
            クエリfake自身。
        """
        # 1. 成功時に画像一覧を空にする操作を指定する。
        self.action = 'delete'
        return self

    def insert(self, payload, **_kwargs):
        """INSERT行を保持してクエリfakeを返す。

        Args:
            payload: event_imagesへ追加する行または行一覧。
            **_kwargs: Supabase insertへ渡す追加指定。

        Returns:
            クエリfake自身。
        """
        # 1. 成功時に画像stateへ反映する行を保持する。
        self.action = 'insert'
        self.payload = payload
        return self

    def eq(self, column: str, value: object):
        """等価条件を記録してクエリfakeを返す。

        Args:
            column: 絞り込み列名。
            value: 絞り込み値。

        Returns:
            クエリfake自身。
        """
        # 1. 読取行をslug・idで判定できるよう条件を保存する。
        self.filters.append((column, value))
        return self

    def in_(self, *_args, **_kwargs):
        """画像読取のIN条件を受け取り、クエリfakeを返す。

        Args:
            *_args: 列名と検索値一覧。
            **_kwargs: Supabase in_へ渡す追加指定。

        Returns:
            クエリfake自身。
        """
        # 1. 本テストでは対象イベントを限定する条件値自体を使わず、連鎖だけを保つ。
        return self

    def order(self, *_args, **_kwargs):
        """並び順条件を受け取り、クエリfakeを返す。

        Args:
            *_args: 並び替え列。
            **_kwargs: Supabase orderへ渡す追加指定。

        Returns:
            クエリfake自身。
        """
        # 1. fakeではstate内の順序を保ち、クエリ連鎖だけを続ける。
        return self

    def single(self):
        """単一行応答を指定してクエリfakeを返す。

        Returns:
            クエリfake自身。
        """
        # 1. executeの応答をdictにする指定を記録する。
        self.single_requested = True
        return self

    def execute(self):
        """段階を記録し、失敗を先に判定してからfake stateへ成功効果を反映する。

        Returns:
            data属性を持つSupabase応答fake。

        Raises:
            RuntimeError: 指定された失敗段階に到達したとき、状態変更より先に送出する。
        """
        # 1. テーブル・操作・条件から失敗段階を特定して実行順を記録する。
        if self.table_name == 'events' and self.action == 'select':
            if self.single_requested:
                stage = 'event_exists'
            elif self.filters and self.filters[-1][0] == 'slug':
                stage = 'public_slug_lookup'
            else:
                stage = 'public_readback'
        elif self.table_name == 'events' and self.action == 'update':
            stage = 'event_update'
        elif self.table_name == 'event_images' and self.action == 'delete':
            stage = 'image_delete'
        elif self.table_name == 'event_images' and self.action == 'insert':
            stage = 'image_insert'
        elif self.table_name == 'event_images' and self.action == 'select':
            stage = 'image_readback'
        else:
            raise AssertionError(f'fakeで扱わないクエリ: {self.table_name}.{self.action}')
        self.operations.append(stage)

        # 2. 指定段階の例外を成功効果より先に発生させるfail-before-apply fakeとして動作する。
        if stage == self.failure_stage:
            raise RuntimeError(f'{stage} failure before fake state apply')

        # 3. 成功した書込だけをfake stateへ即時反映し、読取は現在値を返す。
        if stage == 'event_update':
            self.state['event'].update(self.payload)
            data = []
        elif stage == 'image_delete':
            self.state['images'] = []
            data = []
        elif stage == 'image_insert':
            self.state['images'] = [dict(row) for row in self.payload]
            data = []
        elif stage == 'event_exists':
            data = dict(self.state['event']) if self.single_requested else [dict(self.state['event'])]
        elif stage in {'public_slug_lookup', 'public_readback'}:
            filter_column, filter_value = self.filters[-1]
            if filter_column == 'slug':
                data = [] if self.state['event'].get('slug') != filter_value else [dict(self.state['event'])]
            else:
                data = [dict(self.state['event'])] if self.state['event'].get('id') == filter_value else []
        else:
            data = [dict(row) for row in self.state['images']]
        return MagicMock(data=data)


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

    def _put(self, stage: str, record_event_exists: bool = False) -> tuple[int, list[str]]:
        """指定段階で失敗する PUT を実行し、応答と操作順を返す。

        Args:
            stage: 失敗を注入する操作名。
            record_event_exists: True のとき存在確認も操作ログに含める。

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
        admin_sb = _Supabase(stage, operations, event, exists_check=True, record_event_exists=record_event_exists)
        public_sb = _Supabase(stage, operations, event, exists_check=False, record_event_exists=record_event_exists)
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

    def test_イベント存在確認の一般例外は500で後続処理をしない(self):
        """管理用のイベント存在確認で一般例外が出ると後続操作へ進まず 500 になる。

        Returns:
            なし。
        """
        # 1. 存在確認で RuntimeError を起こし、更新・画像操作・公開読戻しが未実行であることを確認する。
        status, operations = self._put('event_exists', record_event_exists=True)

        assert status == 500
        assert operations == ['event_exists']

    def test_公開読戻しのイベントselect失敗は先行処理後に500(self):
        """公開読戻しのイベント select で一般例外が出ると、先行操作の後に 500 になる。

        Returns:
            なし。
        """
        # 1. 公開イベント select で RuntimeError を起こし、呼び出し順の記録を確認する。
        status, operations = self._put('public_readback', record_event_exists=True)

        assert status == 500
        assert operations == [
            'event_exists',
            'event_update',
            'image_delete',
            'image_insert',
            'public_readback',
        ]

    def test_公開画像読戻し失敗は先行処理後に500(self):
        """公開イベント取得後の画像読戻しで一般例外が出ると 500 になる。

        Returns:
            なし。
        """
        # 1. event_images の取得で RuntimeError を起こし、イベント更新から画像読戻しまでの順を確認する。
        status, operations = self._put('image_readback', record_event_exists=True)

        assert status == 500
        assert operations == [
            'event_exists',
            'event_update',
            'image_delete',
            'image_insert',
            'public_readback',
            'image_readback',
        ]


class TestEventUpdateFailureFakeState:
    """fail-before-apply型の独立fake stateだけで失敗地点別の状態を比較する。"""

    def setup_method(self):
        """イベント更新API用の認証依存をバイパスする。

        Returns:
            なし。
        """
        # 1. PUT APIを認証後のDB処理まで進めるため、テスト中だけ認証依存を置き換える。
        app.dependency_overrides[require_auth] = lambda: None

    def teardown_method(self):
        """認証依存の上書きを解除する。

        Returns:
            なし。
        """
        # 1. 共有FastAPIアプリをテスト前の依存関係へ戻す。
        app.dependency_overrides.clear()

    @pytest.mark.parametrize(
        ('failure_stage', 'expected_event_name', 'expected_image_state', 'expected_operations'),
        [
            (
                'event_update', '更新前イベント', 'old',
                ['event_exists', 'event_update'],
            ),
            (
                'image_delete', '更新後イベント', 'old',
                ['event_exists', 'event_update', 'image_delete'],
            ),
            (
                'image_insert', '更新後イベント', 'empty',
                ['event_exists', 'event_update', 'image_delete', 'image_insert'],
            ),
            (
                'public_readback', '更新後イベント', 'new',
                [
                    'event_exists', 'event_update', 'image_delete', 'image_insert',
                    'public_slug_lookup', 'public_readback',
                ],
            ),
            (
                'image_readback', '更新後イベント', 'new',
                [
                    'event_exists', 'event_update', 'image_delete', 'image_insert',
                    'public_slug_lookup', 'public_readback', 'image_readback',
                ],
            ),
        ],
        ids=['event-update', 'image-delete', 'image-insert', 'public-readback', 'image-readback'],
    )
    def test_fail_before_apply_fakeだけで失敗段階と最終状態を確認する(
        self,
        failure_stage: str,
        expected_event_name: str,
        expected_image_state: str,
        expected_operations: list[str],
    ):
        """PUTの500とfail-before-apply fake内だけの最終stateを段階別に確認する。

        Args:
            failure_stage: execute効果を適用する前にRuntimeErrorを起こす段階。
            expected_event_name: fake stateに残るイベント名。
            expected_image_state: fake stateに残る画像が旧・空・新のいずれか。
            expected_operations: 失敗段階までに記録するfake内操作順。

        Returns:
            なし。
        """
        # 変数の内容: event_id: 対象UUID、old_event/old_images: fake初期値、new_images: リクエスト画像行、state: fake共有状態。
        event_id = '11111111-1111-1111-1111-111111111111'
        old_event = {
            'id': event_id,
            'slug': None,
            'name': '更新前イベント',
            'start_date': '2098-01-01',
            'end_date': None,
            'location': '東京',
            'brands': [],
            'has_workshop': False,
        }
        old_images = [
            {'event_id': event_id, 'url': 'https://example.com/old-1.jpg', 'display_order': 0},
            {'event_id': event_id, 'url': 'https://example.com/old-2.jpg', 'display_order': 1},
        ]
        new_images = [
            {'event_id': event_id, 'url': 'https://example.com/new-1.jpg', 'display_order': 0},
            {'event_id': event_id, 'url': 'https://example.com/new-2.jpg', 'display_order': 1},
        ]
        state = {'event': dict(old_event), 'images': [dict(row) for row in old_images]}
        operations: list[str] = []
        # 1. 管理・公開クライアントを同じfake stateへつなぎ、各executeで指定段階を失敗させる。
        admin_sb = _StatefulSupabaseFake(state, operations, failure_stage)
        public_sb = _StatefulSupabaseFake(state, operations, failure_stage)

        with patch('app.routes.events.admin_supabase', admin_sb), \
             patch('app.routes.events.supabase', public_sb):
            # 変数の内容: response: fail-before-apply fakeを使ったPUT応答。
            response = TestClient(app, raise_server_exceptions=False).put(
                f'/api/events/{event_id}',
                json={
                    'name': '更新後イベント',
                    'start_date': '2099-01-01',
                    'location': '大阪',
                    'image_urls': [row['url'] for row in new_images],
                },
            )

        # 2. HTTP応答と、fakeモデル内の失敗段階までの操作順を確認する。
        assert response.status_code == 500
        assert operations == expected_operations
        # 3. DBの永続化・ロールバックではなく、成功executeのみ反映するfakeの最終stateを比較する。
        expected_event = dict(old_event)
        if expected_event_name == '更新後イベント':
            expected_event.update({
                'name': '更新後イベント',
                'slug': None,
                'start_date': '2099-01-01',
                'end_date': None,
                'time': None,
                'location': '大阪',
                'booth_number': None,
                'address': None,
                'official_url': None,
                'brands': [],
                'has_workshop': False,
                'ws_requires_reservation': True,
                'daily_times': None,
                'is_past': False,
            })
        if expected_image_state == 'old':
            expected_images = old_images
        elif expected_image_state == 'empty':
            expected_images = []
        else:
            expected_images = new_images
        assert state == {'event': expected_event, 'images': expected_images}
