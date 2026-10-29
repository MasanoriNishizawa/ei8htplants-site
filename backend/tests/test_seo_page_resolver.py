"""SEO ページ選択関数の依存注入境界を確認する単体テスト。

DB や HTTP には接続せず、各テスト内で小さな fake/callback を組み立てて
動的ページ、固定ページ、not-found、例外時 fallback の選択契約を検証する。
"""
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

import pytest

from app.routes.seo_page_resolver import SeoPageResolutionDeps, resolve_seo_page_meta


@dataclass
class _Meta:
    """メタ生成callbackが返す、構造化データを持つ最小のテスト用値。"""

    title: str
    description: str = ''
    image: str = ''
    json_ld: list[dict] = field(default_factory=list)


def _deps(**overrides: Any) -> tuple[SeoPageResolutionDeps, dict[str, Any]]:
    """呼び出し記録付きの既定fakeを作り、指定された依存だけを置き換える。

    Args:
        overrides: 個別テストで差し替える依存callbackや固定ページ表。

    Returns:
        依存オブジェクトとfakeの呼び出し記録。
    """
    # 1. テスト中にどの処理が呼ばれたかを順序も含めて記録する。
    # 変数の内容: calls: 各fakeの引数を保持する呼び出し記録。
    calls: dict[str, Any] = {'order': [], 'errors': []}

    # 2. DB取得とメタ生成を、外部接続を持たないcallbackとして用意する。
    def fetch_event(key: str) -> dict:
        """イベントfakeの呼び出しを記録して公開イベントを返す。"""
        calls['order'].append(('fetch_event', key))
        return {'name': 'Plant Market', 'slug': 'plant-market'}

    def fetch_article(key: str) -> dict:
        """記事fakeの呼び出しを記録して公開記事を返す。"""
        calls['order'].append(('fetch_article', key))
        return {'title': '植物のある暮らし'}

    def fetch_product(key: str) -> dict:
        """商品fakeの呼び出しを記録して公開商品を返す。"""
        calls['order'].append(('fetch_product', key))
        return {'name': '陶器鉢'}

    def make_meta(path: str, title: str | None, description: str | None, image: str | None, *extra: Any) -> _Meta:
        """引数を記録してテスト用ページメタを作る。"""
        calls['order'].append(('make_meta', path, title, description, image, *extra))
        return _Meta(title or '既定タイトル', description or '', image or '')

    def not_found_meta(path: str) -> _Meta:
        """not-found callbackの呼び出しを記録して既定メタを返す。"""
        calls['order'].append(('not_found_meta', path))
        return _Meta('既定タイトル')

    def build(name: str):
        """指定した個別ページ生成名を記録するcallbackを作る。"""
        def callback(*args: Any) -> _Meta:
            """呼び出し引数を記録して生成元が分かるテスト用メタを返す。"""
            calls['order'].append((name, *args))
            return _Meta(name)
        return callback

    def event_description(event: dict) -> str:
        """イベント説明のcallback呼び出しを記録して固定文を返す。"""
        calls['order'].append(('event_description', event))
        return 'イベント説明'

    def event_json_ld(event: dict, meta: _Meta) -> dict:
        """イベントJSON-LDのcallback呼び出しを記録して固定データを返す。"""
        calls['order'].append(('event_json_ld', event, meta))
        return {'@type': 'Event'}

    def parse_blocks(value: Any) -> list[dict]:
        """本文解析のcallback呼び出しを記録して空ブロックを返す。"""
        calls['order'].append(('parse_blocks', value))
        return []

    def blocks_to_text(blocks: list[dict]) -> str:
        """本文テキスト化のcallback呼び出しを記録して空文字を返す。"""
        calls['order'].append(('blocks_to_text', blocks))
        return ''

    def first_image_block_url(blocks: list[dict]) -> str | None:
        """本文画像選択のcallback呼び出しを記録して画像なしを返す。"""
        calls['order'].append(('first_image_block_url', blocks))
        return None

    def organization_json_ld() -> dict:
        """Organization JSON-LD生成callbackの呼び出しを記録する。"""
        calls['order'].append(('organization_json_ld',))
        return {'@type': 'Organization'}

    logger = SimpleNamespace(error=lambda *args: calls['errors'].append(args))
    values: dict[str, Any] = {
        'fetch_event': fetch_event,
        'fetch_article': fetch_article,
        'fetch_product': fetch_product,
        'make_meta': make_meta,
        'not_found_meta': not_found_meta,
        'build_event_page_meta': build('build_event_page_meta'),
        'build_article_page_meta': build('build_article_page_meta'),
        'build_product_page_meta': build('build_product_page_meta'),
        'event_description': event_description,
        'event_json_ld': event_json_ld,
        'parse_blocks': parse_blocks,
        'blocks_to_text': blocks_to_text,
        'first_image_block_url': first_image_block_url,
        'static_pages': {},
        'organization_json_ld': organization_json_ld,
        'logger': logger,
        'error_summary': lambda error: f'{type(error).__name__}:要約',
    }
    values.update(overrides)
    return SeoPageResolutionDeps(**values), calls


@pytest.mark.parametrize(
    'path,fetch_name,build_name,key',
    [
        ('/official/events/plant-market', 'fetch_event', 'build_event_page_meta', 'plant-market'),
        ('/official/journal/article-id', 'fetch_article', 'build_article_page_meta', 'article-id'),
        ('/official/shop/product-id', 'fetch_product', 'build_product_page_meta', 'product-id'),
    ],
)
def test_動的ページは対応する取得とページメタ生成へ渡す(path, fetch_name, build_name, key):
    """イベント・記事・商品を対応するfakeに渡して結果を返す。

    Args:
        path: 解決する正規化済みURL。
        fetch_name: 呼ばれるレコード取得callback名。
        build_name: 呼ばれる個別ページメタ生成callback名。
        key: パスから取得callbackへ渡す識別子。

    Returns:
        なし。
    """
    # 1. 1ページ種別に対応する取得fakeと生成fakeだけが実行されることを確認する。
    deps, calls = _deps()
    result = resolve_seo_page_meta(path, None, deps)
    assert result.title == build_name
    assert calls['order'][0] == (fetch_name, key)
    assert calls['order'][1][0] == build_name
    assert not calls['errors']


@pytest.mark.parametrize(
    'path,fetch_name',
    [
        ('/official/events/missing', 'fetch_event'),
        ('/official/journal/missing', 'fetch_article'),
        ('/official/shop/missing', 'fetch_product'),
    ],
)
def test_動的レコードが見つからない場合はnot_foundを返す(path, fetch_name):
    """イベント・記事・商品が未登録ならnot-found生成だけを使う。

    Args:
        path: 未登録の動的ページURL。
        fetch_name: パスに対応するレコード取得callback名。

    Returns:
        なし。
    """
    # 1. 対象レコードの取得結果をNoneにし、not-foundへのfallbackを確認する。
    requested: list[str] = []

    def missing(key: str) -> None:
        """要求されたIDを記録し、対象レコードが無い状態を返す。"""
        requested.append(key)
        return None

    deps, calls = _deps(**{fetch_name: missing})
    result = resolve_seo_page_meta(path, None, deps)
    assert result.title == '既定タイトル'
    assert requested == [path.rsplit('/', 1)[-1]]
    assert calls['order'] == [('not_found_meta', path)]


@pytest.mark.parametrize('path', ['/', '/official'])
def test_トップページにはOrganization_JSON_LDを付ける(path):
    """ルートと公式サイトトップの固定メタにOrganization JSON-LDを追加する。

    Args:
        path: Organization JSON-LDを持つトップページのパス。

    Returns:
        なし。
    """
    # 1. トップページの固定メタを用意し、構造化データが一度追加されることを確認する。
    page = SimpleNamespace(title='トップ', description='案内', image='/top.jpg')
    deps, calls = _deps(static_pages={path: page})
    result = resolve_seo_page_meta(path, None, deps)
    assert result.json_ld == [{'@type': 'Organization'}]
    assert ('organization_json_ld',) in calls['order']


def test_過去イベントの固定ページはqueryに応じてタイトルを変える():
    """events?page=past の固定ページタイトルを Past Events にする。

    Returns:
        なし。
    """
    # 1. 通常イベント一覧の固定情報に過去ページのクエリを適用する。
    path = '/official/events'
    page = SimpleNamespace(title='Events', description='一覧', image='/events.jpg')
    deps, calls = _deps(static_pages={path: page})
    result = resolve_seo_page_meta(path, {'page': 'past'}, deps)
    assert result.title == 'Past Events'
    assert calls['order'][0][0] == 'make_meta'
    assert calls['order'][0][2] == 'Past Events'


def test_動的ページは同じpathの固定ページより先に解決する():
    """動的イベントの取得が固定ページ表の照合より先に行われる。

    Returns:
        なし。
    """
    # 1. 動的イベントのパスを固定ページ表にも登録し、動的ページが優先されることを確認する。
    path = '/official/events/plant-market'
    deps, calls = _deps(static_pages={path: SimpleNamespace(title='静的ページ', description='', image='')})
    result = resolve_seo_page_meta(path, None, deps)
    assert result.title == 'build_event_page_meta'
    assert calls['order'][0][0] == 'fetch_event'
    assert not any(call[0] == 'make_meta' for call in calls['order'])


def test_DB例外は要約付きで記録して通常のfallbackを返す():
    """取得例外を記録し、既定メタ生成に戻して例外本文を漏らさない。

    Returns:
        なし。
    """
    # 1. 取得callbackを例外にし、例外要約だけをloggerへ渡すことを確認する。
    def broken_fetch(key: str) -> None:
        raise RuntimeError('機密になりうるDB例外本文')

    deps, calls = _deps(fetch_event=broken_fetch)
    result = resolve_seo_page_meta('/official/events/plant-market', None, deps)
    assert result.title == '既定タイトル'
    assert calls['errors'] == [
        ('build_page_meta DB 読み取りエラー（%r）: %s', '/official/events/plant-market', 'RuntimeError:要約')
    ]
    assert '機密になりうるDB例外本文' not in repr(calls['errors'])
    assert calls['order'][-1] == ('make_meta', '/official/events/plant-market', None, None, None)
