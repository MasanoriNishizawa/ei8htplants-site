"""
shipping エンドポイントのテスト。
対象: backend/app/routes/shipping.py
テスト概要: 都道府県一覧取得と送料取得の正常/異常ケースを確認する。
DBアクセスなし（静的データのみ）のため supabase モックは不要。
"""
from fastapi.testclient import TestClient
from app.main import app

# shipping.py で定義されている全都道府県数（47都道府県）
EXPECTED_PREFECTURE_COUNT = 47


class TestListPrefectures:
    """都道府県一覧 GET /api/shipping/prefectures のテスト。"""

    def test_都道府県リストが返る(self):
        """都道府県の一覧が配列で返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/prefectures')

        assert resp.status_code == 200
        # 変数の内容: data: API が返す都道府県名一覧。。
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_47都道府県すべて含まれる(self):
        """47都道府県すべてがリストに含まれること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/prefectures')

        assert resp.status_code == 200
        # 変数の内容: data: API が返す47都道府県名一覧。。
        data = resp.json()
        assert len(data) == EXPECTED_PREFECTURE_COUNT

    def test_主要都道府県が含まれる(self):
        """東京都・大阪府・北海道・沖縄県がリストに含まれること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/prefectures')

        assert resp.status_code == 200
        # 変数の内容: data: API が返す都道府県名一覧。。
        data = resp.json()
        # 変数の内容: pref: pref の反復ごとの値。
        for pref in ['東京都', '大阪府', '北海道', '沖縄県']:
            assert pref in data, f'{pref} が一覧に含まれていない'


class TestGetRate:
    """送料取得 GET /api/shipping/rate のテスト。"""

    def test_東京都の配送料が返る(self):
        """prefecture=東京都 を指定したとき配送料オブジェクトが返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/rate?prefecture=東京都')

        assert resp.status_code == 200
        # 変数の内容: data: API が返す東京都向け配送料データ。。
        data = resp.json()
        assert 'fee' in data

    def test_配送料が正の整数(self):
        """配送料（fee）は正の整数であること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/rate?prefecture=東京都')

        assert resp.status_code == 200
        # 変数の内容: fee: 手数料または送料。
        fee = resp.json()['fee']
        assert isinstance(fee, int)
        assert fee > 0

    def test_北海道の配送料が大阪より高い(self):
        """北海道は大阪府より配送料が高い（地理的に遠いため）こと。

        Returns:
            なし。
        """
        # 変数の内容: fee_hokkaido: 北海道宛ての送料計算結果、fee_osaka: 大阪府宛ての送料計算結果、resp_hokkaido: 北海道宛ての送料 API 応答、resp_osaka: 大阪府宛ての送料 API 応答。
        resp_hokkaido = TestClient(app).get('/api/shipping/rate?prefecture=北海道')
        resp_osaka = TestClient(app).get('/api/shipping/rate?prefecture=大阪府')

        fee_hokkaido = resp_hokkaido.json()['fee']
        fee_osaka = resp_osaka.json()['fee']
        assert fee_hokkaido > fee_osaka

    def test_沖縄の配送料が最も高い(self):
        """沖縄県の配送料は東京都より高いこと。

        Returns:
            なし。
        """
        # 変数の内容: fee_okinawa: 沖縄県宛ての送料計算結果、fee_tokyo: 東京都宛ての送料計算結果、resp_okinawa: 沖縄県宛ての送料 API 応答、resp_tokyo: 東京都宛ての送料 API 応答。
        resp_okinawa = TestClient(app).get('/api/shipping/rate?prefecture=沖縄県')
        resp_tokyo = TestClient(app).get('/api/shipping/rate?prefecture=東京都')

        fee_okinawa = resp_okinawa.json()['fee']
        fee_tokyo = resp_tokyo.json()['fee']
        assert fee_okinawa > fee_tokyo

    def test_未対応の都道府県は400(self):
        """RATES に存在しない都道府県を指定すると 400 が返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/rate?prefecture=存在しない県')

        assert resp.status_code == 400

    def test_prefecture未指定は422(self):
        """prefecture クエリパラメータを指定しないと 422 バリデーションエラーが返ること。

        Returns:
            なし。
        """
        # 変数の内容: resp: API から返されたレスポンス。
        resp = TestClient(app).get('/api/shipping/rate')

        assert resp.status_code == 422

    def test_全都道府県で配送料が取得できる(self):
        """都道府県リストに含まれるすべての都道府県で配送料取得ができること。

        Returns:
            なし。
        """
        # 変数の内容: prefectures: 送料テストで使う都道府県一覧、prefectures_resp: 都道府県別送料の API 応答。
        prefectures_resp = TestClient(app).get('/api/shipping/prefectures')
        prefectures = prefectures_resp.json()

        # 変数の内容: pref: pref の反復ごとの値。
        for pref in prefectures:
            # 変数の内容: resp: API から返されたレスポンス。
            resp = TestClient(app).get(f'/api/shipping/rate?prefecture={pref}')
            assert resp.status_code == 200, f'{pref} の送料取得に失敗'
            assert resp.json()['fee'] > 0, f'{pref} の送料が0以下'
