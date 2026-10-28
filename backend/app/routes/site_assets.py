"""サイト共通の画像設定 API。

公開: キーを指定した画像 URL の取得
管理者: 画像 URL の保存（画像ファイルは既存の /upload から Storage に保存）
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_auth
from ..db import admin_supabase, supabase

# 変数の内容: router: この API 群のルーター。
router = APIRouter(prefix='/site-assets', tags=['site-assets'])

# 公開ページから変更する画像設定だけを許可する
EDITABLE_KEYS = {'hue-color-study'} | {f'hue-color-{index:02d}' for index in range(1, 7)}


class SiteAssetBody(BaseModel):
    """サイト画像の保存内容。空 URL は公開画像を外すときに使う。"""

    # 変数の内容: url: 公開または転送に使う URL。
    url: str = Field(max_length=2048)


def _check_key(key: str) -> None:
    """定義済みキー以外の読書きを拒否する。

    Args:
        key: 読み書き対象の設定キー。

    Returns:
        なし。
    """
    if key not in EDITABLE_KEYS:
        raise HTTPException(status_code=404, detail='Site asset not found')


@router.get('/{key}')
def get_site_asset(key: str) -> dict:
    """公開ページ用に画像 URL を返す。未登録なら空 URL を返す。

    Args:
        key: 読み書き対象の設定キー。

    Returns:
        注釈に示した形式の応答（dict）。
    """
    _check_key(key)
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = supabase.table('site_assets').select('key,url').eq('key', key).limit(1).execute().data
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
    _check_key(key)
    # 変数の内容: rows: DB から取得した行の一覧。
    rows = admin_supabase.table('site_assets').upsert({'key': key, 'url': body.url}).execute().data
    return rows[0] if rows else {'key': key, 'url': body.url}
