"""
price_calc_entries エンドポイントのテスト。
対象: backend/app/routes/price_calc_entries.py
テスト概要: 価格計算エントリの一覧取得・作成・削除の正常/異常ケースを確認する。
全エンドポイントが管理者認証（require_auth）を要求するため、テスト時はオーバーライドする。
"""
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.auth import require_auth

# --- テスト用サンプルデータ ---

# 価格計算エントリサンプル
ENTRY_1 = {
    'id': 'e1',
    'brand': 'ei8ht plants',
    'plant_name': 'アガベ チタノタ',
    'pot_artist_name': '山田鉢師',
    'cost': 3000.0,
    'selling_price': 8000.0,
    'created_at': '2024-01-01T00:00:00+00:00',
}

# ENTRY_2: 管理画面の個別保存テストで使う2件目の登録データ。
ENTRY_2 = {
    'id': 'e2',
    'brand': 'HUE',
    'plant_name': 'パキポディウム',
    'pot_artist_name': None,
    'cost': 5000.0,
    'selling_price': 12000.0,
    'created_at': '2024-01-02T00:00:00+00:00',
}


def _make_sb_mock():
    """admin_supabase の MagicMock を返す。

    Returns:
        設定したテスト用モックを返す。
    """
    return MagicMock()


def _auth_override():
    """認証を無効化するオーバーライド関数。テスト時のみ使用する。

    Returns:
        認証依存関係を差し替える関数を返す。
    """
    return None


class TestListEntries:
    """価格計算エントリ一覧 GET /api/price-calc-entries のテスト。"""

    def test_一覧が返る(self):
        """エントリが存在するとき配列が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        mock_sb = _make_sb_mock()
        # table().select().order().execute().data のチェーン
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = [ENTRY_1, ENTRY_2]

        # 1. require_auth を無効化してリクエストを送る
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).get('/api/price-calc-entries')
        finally:
            # 2. テスト後に必ずオーバーライドを解除する
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        # 変数の内容: data: Supabase モックが返す価格計算登録一覧。。
        data = resp.json()
        assert len(data) == 2
        assert data[0]['id'] == 'e1'

    def test_0件のとき空配列(self):
        """エントリが0件のとき空配列が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. エントリが0件のとき空配列が返ること。
        mock_sb = _make_sb_mock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = []

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).get('/api/price-calc-entries')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == []

    def test_認証なしで401(self):
        """Authorization ヘッダーなしでアクセスすると 401 が返ること。

        Returns:
            なし。
        """
        # require_auth をオーバーライドしないで本来の認証チェックが走るようにする
        # 1. Authorization ヘッダーなしでアクセスすると 401 が返ること。
        resp = TestClient(app).get('/api/price-calc-entries')
        assert resp.status_code == 401


class TestAddEntry:
    """価格計算エントリ作成 POST /api/price-calc-entries のテスト。"""

    def test_正常にエントリを作成できる(self):
        """正しいリクエストボディでエントリが作成され、作成されたレコードが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 正しいリクエストボディでエントリが作成され、作成されたレコードが返ること。
        mock_sb = _make_sb_mock()
        # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [ENTRY_1]

        # 変数の内容: payload: DB に保存する値。
        payload = {
            'brand': 'ei8ht plants',
            'plant_name': 'アガベ チタノタ',
            'pot_artist_name': '山田鉢師',
            'cost': 3000.0,
            'selling_price': 8000.0,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/price-calc-entries', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json()['id'] == 'e1'

    def test_pot_artist_nameはNullable(self):
        """pot_artist_name は省略可能でNoneでも正常に作成できること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. pot_artist_name は省略可能でNoneでも正常に作成できること。
        mock_sb = _make_sb_mock()
        # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.insert.return_value.execute.return_value.data = [ENTRY_2]

        # 変数の内容: payload: DB に保存する値。
        payload = {
            'brand': 'HUE',
            'plant_name': 'パキポディウム',
            'cost': 5000.0,
            'selling_price': 12000.0,
        }

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/price-calc-entries', json=payload)
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200

    def test_brandが欠けると422(self):
        """brand フィールドが欠けると 422 バリデーションエラーが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. brand フィールドが欠けると 422 バリデーションエラーが返ること。
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/price-calc-entries', json={
                    'plant_name': 'アガベ',
                    'cost': 1000.0,
                    'selling_price': 3000.0,
                })
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422

    def test_plant_nameが欠けると422(self):
        """plant_name フィールドが欠けると 422 バリデーションエラーが返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. plant_name フィールドが欠けると 422 バリデーションエラーが返ること。
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).post('/api/price-calc-entries', json={
                    'brand': 'ei8ht plants',
                    'cost': 1000.0,
                    'selling_price': 3000.0,
                })
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 422


class TestDeleteEntry:
    """価格計算エントリ削除 DELETE /api/price-calc-entries/:id のテスト。"""

    def test_正常に削除するとokが返る(self):
        """削除に成功すると {"ok": True} が返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 削除に成功すると {"ok": True} が返ること。
        mock_sb = _make_sb_mock()

        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).delete('/api/price-calc-entries/e1')
        finally:
            app.dependency_overrides.pop(require_auth, None)

        assert resp.status_code == 200
        assert resp.json() == {'ok': True}


def _post_entry(payload: dict, insert_result: list | None = None):
    """認証をオーバーライドして POST /api/price-calc-entries を送り、応答と Supabase のモックを返す。

    Args:
        payload: 送る JSON
        insert_result: insert().execute().data に返す行（省略時は送った内容に id を付けた 1 行）

    Returns:
        (応答, Supabase のモック)
    """
    # 1. insert のチェーンが返す行を用意する
    mock_sb = _make_sb_mock()
    # 変数の内容: mock_sb.table.return_value.insert.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
    mock_sb.table.return_value.insert.return_value.execute.return_value.data = (
        insert_result if insert_result is not None else [{**payload, 'id': 'new', 'created_at': '2026-10-25T00:00:00+00:00'}]
    )
    # 2. 認証を無効化して送り、終わったら必ず戻す
    app.dependency_overrides[require_auth] = _auth_override
    try:
        with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/price-calc-entries', json=payload)
    finally:
        app.dependency_overrides.pop(require_auth, None)
    return resp, mock_sb


def _inserted_row(mock_sb) -> dict:
    """insert に渡された dict を返す（1 回だけ呼ばれていることも確かめる）。

    Args:
        mock_sb: Supabase クライアントを模したモック。

    Returns:
        dict を返す。
    """
    mock_sb.table.return_value.insert.assert_called_once()
    return mock_sb.table.return_value.insert.call_args.args[0]


# 種類のテストで使う基本の入力（mode と pot_artist_name 以外）
BASE_PAYLOAD = {'brand': 'hue', 'plant_name': 'オベサ', 'cost': 1500.0, 'selling_price': 3800.0}


class TestAddEntryMode:
    """POST /api/price-calc-entries の種類（mode）と、None の項目を insert に渡さないことのテスト。"""

    def test_modeにproductionを送るとinsertに渡されて応答にも入る(self):
        """mode='production' を受け取り、insert の dict に mode が入り、作成した行がそのまま返ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. mode='production' を受け取り、insert の dict に mode が入り、作成した行がそのまま返ること。
        resp, mock_sb = _post_entry({**BASE_PAYLOAD, 'mode': 'production'})
        assert resp.status_code == 200
        assert _inserted_row(mock_sb)['mode'] == 'production'
        assert resp.json()['mode'] == 'production'
        mock_sb.table.assert_called_with('price_calc_entries')

    def test_modeにpurchaseを送るとinsertに渡される(self):
        """mode='purchase' を受け取り、insert の dict に mode='purchase' が入ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. mode='purchase' を受け取り、insert の dict に mode='purchase' が入ること。
        resp, mock_sb = _post_entry({**BASE_PAYLOAD, 'mode': 'purchase'})
        assert resp.status_code == 200
        assert _inserted_row(mock_sb) == {**BASE_PAYLOAD, 'mode': 'purchase'}

    def test_modeを省くとinsertのdictにmodeキーが無い(self):
        """mode を省略すると insert に 'mode' キーを渡さない（DB の既定の NULL で入る。021 未実行の DB でも通る）。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. mode を省略すると insert に 'mode' キーを渡さない（DB の既定の NULL で入る。021 未実行の DB でも通る）。
        resp, mock_sb = _post_entry(dict(BASE_PAYLOAD))
        assert resp.status_code == 200
        assert 'mode' not in _inserted_row(mock_sb)

    def test_modeにnullを送るとinsertのdictにmodeキーが無い(self):
        """mode=null を明示しても 422 にはならず、insert に 'mode' キーを渡さないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
        # 1. mode=null を明示しても 422 にはならず、insert に 'mode' キーを渡さないこと。
        resp, mock_sb = _post_entry({**BASE_PAYLOAD, 'mode': None})
        assert resp.status_code == 200
        assert 'mode' not in _inserted_row(mock_sb)

    def test_pot_artist_nameがnullならinsertのdictにpot_artist_nameキーが無い(self):
        """pot_artist_name=null は insert に渡さず、ほかの項目はそのまま渡すこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス、row: DB から取得した単一レコード。
        # 1. pot_artist_name=null は insert に渡さず、ほかの項目はそのまま渡すこと。
        resp, mock_sb = _post_entry({**BASE_PAYLOAD, 'pot_artist_name': None, 'mode': 'production'})
        assert resp.status_code == 200
        row = _inserted_row(mock_sb)
        assert 'pot_artist_name' not in row
        assert row == {**BASE_PAYLOAD, 'mode': 'production'}

    def test_pot_artist_nameに値があればinsertに渡される(self):
        """pot_artist_name に作家名があれば insert の dict に入ること。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、payload: DB に保存する値、resp: API から返されたレスポンス。
        # 1. pot_artist_name に作家名があれば insert の dict に入ること。
        payload = {**BASE_PAYLOAD, 'brand': 'habitatoides', 'pot_artist_name': '山田陶房', 'mode': 'purchase'}
        # 変数の内容: resp: テスト対象 API の HTTP 応答、mock_sb: Supabase クライアントを置き換えるテスト用モック。
        resp, mock_sb = _post_entry(payload)
        assert resp.status_code == 200
        assert _inserted_row(mock_sb) == payload

    def test_modeに不正な値を送ると422でinsertしない(self):
        """mode が production・purchase・seedling 以外なら 422 で、insert は呼ばれないこと。

        Returns:
            なし。
        """
        # 変数の内容: bad: 不正なテスト入力。
        # 1. mode が production・purchase・seedling 以外なら 422 で、insert は呼ばれないこと。
        for bad in ['Production', 'PURCHASE', '', 1, ['production']]:
            # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、resp: API から返されたレスポンス。
            resp, mock_sb = _post_entry({**BASE_PAYLOAD, 'mode': bad})
            assert resp.status_code == 422, bad
            mock_sb.table.return_value.insert.assert_not_called()

    def test_modeがseedlingならinsertに渡される(self):
        """実生の mode を受け付け、insert の dict に渡すこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、payload: DB に保存する値、resp: API から返されたレスポンス。
        # 1. 実生の mode を受け付け、insert の dict に渡すこと。
        payload = {**BASE_PAYLOAD, 'mode': 'seedling'}
        # 変数の内容: resp: テスト対象 API の HTTP 応答、mock_sb: Supabase クライアントを置き換えるテスト用モック。
        resp, mock_sb = _post_entry(payload)
        assert resp.status_code == 200
        assert _inserted_row(mock_sb) == payload

    def test_一覧はmodeを含む行をそのまま返す(self):
        """GET の一覧は DB の行（mode が production・purchase・seedling・null）をそのまま返すこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック、rows: DB から取得した行の一覧。
        # 1. GET の一覧は DB の行（mode が production・purchase・seedling・null）をそのまま返すこと。
        rows = [
            {**ENTRY_1, 'mode': 'production'},
            {**ENTRY_2, 'mode': 'purchase'},
            {**ENTRY_2, 'id': 'e3', 'mode': 'seedling'},
            {**ENTRY_2, 'id': 'e4', 'mode': None},
        ]
        mock_sb = _make_sb_mock()
        # 変数の内容: mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data: モックのクエリ応答に含めるデータ。
        mock_sb.table.return_value.select.return_value.order.return_value.execute.return_value.data = rows
        app.dependency_overrides[require_auth] = _auth_override
        try:
            with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
                # 変数の内容: resp: API から返されたレスポンス。
                resp = TestClient(app).get('/api/price-calc-entries')
        finally:
            app.dependency_overrides.pop(require_auth, None)
        assert resp.status_code == 200
        assert [r['mode'] for r in resp.json()] == ['production', 'purchase', 'seedling', None]

    def test_認証なしでmodeを送ると401でinsertしない(self):
        """認証なしでは mode を付けても 401 で、insert は呼ばれないこと。

        Returns:
            なし。
        """
        # 変数の内容: mock_sb: 公開用 Supabase クライアントのモック。
        # 1. 認証なしでは mode を付けても 401 で、insert は呼ばれないこと。
        mock_sb = _make_sb_mock()
        with patch('app.routes.price_calc_entries.admin_supabase', mock_sb):
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).post('/api/price-calc-entries', json={**BASE_PAYLOAD, 'mode': 'production'})
        assert resp.status_code == 401
        mock_sb.table.return_value.insert.assert_not_called()
