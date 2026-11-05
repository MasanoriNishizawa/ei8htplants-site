"""サイト共通の画像設定 API。

公開: キーを指定した画像 URL の取得、prefix を指定した画像 URL の一括取得
管理者: 画像 URL の保存（画像ファイルは既存の /upload から Storage に保存）
"""
from fastapi import APIRouter, Depends, HTTPException, Query
import re

from pydantic import BaseModel, Field, field_validator

from ..auth import require_auth
from ..db import admin_supabase, supabase

# 変数の内容: router: この API 群のルーター。
# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter(prefix='/site-assets', tags=['site-assets'])

# 公開ページから変更する画像設定だけを許可する
# 変数の内容: HUE_COLOR_KEYS: HUE ページの色見本画像のキー集合
#   （'hue-color-study' と 'hue-color-01' 〜 'hue-color-06' の7個）。
HUE_COLOR_KEYS = {'hue-color-study'} | {f'hue-color-{index:02d}' for index in range(1, 7)}

# 変数の内容: HABITAT_MOTION_KEYS: Habitat Oides トップページの動きのある画像のキー集合（11個）。
#   - 'habitat-hero-01' 〜 'habitat-hero-05': 一番上のスライダー画像（5個）
#   - 'habitat-object-01' 〜 'habitat-object-06': スクロールで動くオブジェクト画像（6個）
#   右下に固定するブランドの看板（サイン）画像は、管理画面からは変えず
#   プロジェクト内のファイルだけで表示するため、ここには含めない
#   （'habitat-sign' は許可しないキーとして 404 になる）。
HABITAT_MOTION_KEYS = (
    {f'habitat-hero-{index:02d}' for index in range(1, 6)}
    | {f'habitat-object-{index:02d}' for index in range(1, 7)}
)

# 変数の内容: HABITAT_PAGE_KEYS: Habitat Oides の、上の動きのある画像以外のページ写真のキー集合（3個）。
#   - 'habitat-world': トップページの「考え方」の欄に出す写真
#   - 'habitat-workshop-photo': トップページのワークショップの欄に出す写真
#   - 'habitat-workshop-main': Workshop ページの一番上に出すメインの写真
#   どれも 'habitat-' で始まるため、prefix 'habitat-' の一括取得で
#   HABITAT_MOTION_KEYS の11件と合わせて14件がキー名の昇順で返る。
HABITAT_PAGE_KEYS = {'habitat-world', 'habitat-workshop-photo', 'habitat-workshop-main'}

# 変数の内容: EI8HT_PAGE_KEYS: ei8ht plants の各ページの画像のキー集合（3個）。
#   - 'ei8ht-hero': トップページの一番上に出す画像
#   - 'ei8ht-wordmark': トップページに出す文字ロゴの画像
#   - 'ei8ht-about-hero': About ページの一番上に出すメインの写真
#   トップページ以外のキーも入るため、以前の名前 EI8HT_HOME_KEYS から付け直した。
#   prefix 'ei8ht-' の一括取得で、この3件をキー名の昇順でまとめて取得できる。
EI8HT_PAGE_KEYS = {'ei8ht-hero', 'ei8ht-wordmark', 'ei8ht-about-hero'}

# 変数の内容: OFFICIAL_PAGE_KEYS: /official 以下の公式サイトのページの画像のキー集合（4個）。
#   - 'official-hero': 公式サイト Home の一番上に出すメインの写真
#   - 'official-brand-ei8ht': ブランド紹介のカードに出す ei8ht plants の写真
#   - 'official-brand-habitat': ブランド紹介のカードに出す Habitat Oides の写真
#   - 'official-brand-hue': ブランド紹介のカードに出す HUE の写真
#   ブランドの写真3個は、Home と Our Brands の両方のページで同じキーを共通で使う。
#   prefix 'official-' の一括取得で、この4件をキー名の昇順でまとめて取得できる。
OFFICIAL_PAGE_KEYS = {
    'official-hero',
    'official-brand-ei8ht',
    'official-brand-habitat',
    'official-brand-hue',
}

# 変数の内容: EDITABLE_KEYS: API 経由で読み書きを許可するサイト画像のキー集合（上の各集合の和）。
EDITABLE_KEYS = (
    HUE_COLOR_KEYS
    | HABITAT_MOTION_KEYS
    | HABITAT_PAGE_KEYS
    | EI8HT_PAGE_KEYS
    | OFFICIAL_PAGE_KEYS
)


# 変数の内容: _URL_FORBIDDEN_CHARS: URL の中に入っていたら拒否する文字のパターン。
#   空白・タブ・改行などの制御文字（U+0000〜U+0020 と U+007F）と、バックスラッシュ。
#   ブラウザは URL 中のタブ・改行を取り除き、バックスラッシュを '/' と同じに扱うため、
#   '/' + バックスラッシュ + 'evil.example' や '/<タブ>/evil.example' が '//evil.example'（別サイト）として
#   読まれてしまう。これを防ぐために、途中にこれらの文字があるものは受け付けない。
_URL_FORBIDDEN_CHARS = re.compile(r'[\x00-\x20\x7f\\]')


class SiteAssetBody(BaseModel):
    """サイト画像の保存内容。空 URL は公開画像を外すときに使う。

    受け付ける url の形（前後の空白は取り除いてから確かめる）:
      - 空文字 ''（画像を外すとき）
      - '/' で始まり '//' で始まらないもの（サイト内のパス。例 '/img/hue/01.jpg'）
      - 'https://' で始まるもの（Supabase Storage の公開 URL など）
    それ以外（'javascript:'・'http://'・'data:'・'//evil.example' など）は
    pydantic の検証エラーとなり、API は 422 を返す。
    """

    # 変数の内容: url: 公開ページで表示する画像の URL（上の3つの形のどれか。最大 2048 文字）。
    url: str = Field(max_length=2048)

    @field_validator('url', mode='before')
    @classmethod
    def strip_url(cls, v: object) -> object:
        """url の前後の空白を取り除く（長さの確認より先に行う）。

        Args:
            v: 送られてきた url の値。

        Returns:
            文字列なら前後の空白を取り除いた値、文字列でなければそのまま
            （型の誤りは後ろの str の検証で 422 になる）。
        """
        # 1. 文字列のときだけ前後の空白を取り除く。
        return v.strip() if isinstance(v, str) else v

    @field_validator('url')
    @classmethod
    def check_url_shape(cls, v: str) -> str:
        """url が受け付ける3つの形のどれかであることを確かめる。

        Args:
            v: 前後の空白を取り除き、長さの確認を通った url。

        Returns:
            確認を通った url（そのまま）。

        Raises:
            ValueError: 受け付けない形のとき（FastAPI が 422 にする）。
        """
        # 1. 空文字は「画像を外す」操作としてそのまま受け付ける。
        if v == '':
            return v
        # 2. 途中に空白・制御文字・バックスラッシュがあるものは、ブラウザで別サイトの
        #    URL に読み替えられるおそれがあるため拒否する。
        if _URL_FORBIDDEN_CHARS.search(v):
            raise ValueError('URL に空白・制御文字・バックスラッシュは使えません')
        # 3. サイト内のパス（'/' で始まり '//' で始まらない）は受け付ける。
        #    '//' で始まるものは別サイトを指す URL になるため、ここでは通さない。
        if v.startswith('/') and not v.startswith('//'):
            return v
        # 4. https の URL（Supabase Storage の公開 URL など）は受け付ける。
        if v.startswith('https://'):
            return v
        # 5. 上のどれにも当たらないもの（javascript:・http://・data:・//〜 など）は拒否する。
        raise ValueError("URL は ''・'/' で始まるサイト内のパス・'https://' で始まる URL のどれかにしてください")


def _check_key(key: str) -> None:
    """定義済みキー以外の読書きを拒否する。

    Args:
        key: 読み書き対象の設定キー。

    Returns:
        なし。
    """
    # 1. 編集可能なキー一覧に無いキーは、存在しない設定として拒否する。
    if key not in EDITABLE_KEYS:
        raise HTTPException(status_code=404, detail='Site asset not found')


@router.get('')
def list_site_assets(prefix: str = Query('', max_length=100)) -> list[dict]:
    """公開ページ用に、prefix で始まる許可キーの画像 URL をまとめて返す。

    例: GET /api/site-assets?prefix=habitat- で Habitat Oides の画像14件を返す
    （動きのある画像11件＋ページの写真3件）。
    認証は不要（公開ページから読む）。

    Args:
        prefix: 取得したいキーの先頭文字列（必須。例 'habitat-'）。

    Returns:
        [{'key': キー, 'url': 画像 URL}] の一覧。キー名の昇順で、
        DB に行がないキーは url を '' にして含める。

    Raises:
        HTTPException: prefix が空、または当てはまる許可キーが1つもないときは 404。
    """
    # 1. prefix が空なら全件取得になってしまうため、存在しない設定として拒否する。
    if not prefix:
        raise HTTPException(status_code=404, detail='Site asset not found')

    # 2. 許可キーのうち prefix で始まるものをキー名の昇順で選ぶ。
    # 変数の内容: keys: 返す対象のキー名の一覧（昇順）。
    keys = sorted(key for key in EDITABLE_KEYS if key.startswith(prefix))
    if not keys:
        raise HTTPException(status_code=404, detail='Site asset not found')

    # 3. 対象キーの行を1回のクエリでまとめて読む。
    # 変数の内容: rows: DB から取得した行の一覧（登録済みのキーだけが入る）。
    rows = supabase.table('site_assets').select('key,url').in_('key', keys).execute().data or []
    # 変数の内容: url_by_key: キー名から保存済み URL を引く辞書（URL が None の行は '' として扱う）。
    url_by_key = {row['key']: row.get('url') or '' for row in rows}

    # 4. 許可キーの順に並べ、DB に行がないキーは空 URL で補う。
    return [{'key': key, 'url': url_by_key.get(key, '')} for key in keys]


@router.get('/{key}')
def get_site_asset(key: str) -> dict:
    """公開ページ用に画像 URL を返す。未登録なら空 URL を返す。

    Args:
        key: 読み書き対象の設定キー。

    Returns:
        注釈に示した形式の応答（dict）。
    """
    # 1. 公開対象として許可されたキーだけを受け付ける。
    _check_key(key)
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = supabase.table('site_assets').select('key,url').eq('key', key).limit(1).execute().data
    # 2. 登録済み設定を返し、未登録なら空 URL の初期値を返す。
    return rows[0] if rows else {'key': key, 'url': ''}


@router.put('/{key}')
def save_site_asset(key: str, body: SiteAssetBody, _=Depends(require_auth)) -> dict:
    """管理者が画像 URL を設定・更新する。

    Args:
        key: 読み書き対象の設定キー。
        body: API に送るリクエスト本文。
        _: 認証依存として注入される値（この関数では使用しません）。

    Returns:
        注釈に示した形式の応答（dict）。
    """
    # 1. 管理者が指定したキーを許可一覧と照合する。
    _check_key(key)
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = admin_supabase.table('site_assets').upsert({'key': key, 'url': body.url}).execute().data
    # 2. 保存結果を返し、DB応答に行がない場合は入力値から応答を組み立てる。
    return rows[0] if rows else {'key': key, 'url': body.url}
