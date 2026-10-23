"""設計書（doc/ の Markdown）を管理画面で読むための API（管理者のみ）。"""
import pathlib

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from ..auth import require_auth

# 設計書の API は管理画面からだけ使うので、ルーター全体でログインを必須にする
router = APIRouter(dependencies=[Depends(require_auth)])

# 設計書のフォルダ（プロジェクトルートの doc/）
DOC_ROOT = pathlib.Path(__file__).parent.parent.parent.parent / 'doc'


def _build_tree(directory: pathlib.Path, base: pathlib.Path) -> list[dict]:
    """ディレクトリを再帰的に走査し、.md ファイルのみを含むツリー構造を返す。

    ディレクトリは type='dir'、ファイルは type='file' として表現し、
    ドットファイルと __pycache__ は除外する。

    Args:
        directory: 走査するディレクトリのパス
        base: 相対パス計算の起点となるベースディレクトリ

    Returns:
        各エントリが type/name/path（およびディレクトリは children）を持つ辞書のリスト
    """
    items: list[dict] = []
    try:
        entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name))
    except PermissionError:
        return items
    for entry in entries:
        if entry.name.startswith('.') or entry.name == '__pycache__':
            continue
        rel = entry.relative_to(base).as_posix()
        if entry.is_dir():
            items.append({
                'type': 'dir',
                'name': entry.name,
                'path': rel,
                'children': _build_tree(entry, base),
            })
        elif entry.suffix == '.md':
            items.append({
                'type': 'file',
                'name': entry.name,
                'path': rel,
            })
    return items


@router.get('/docs/tree')
def get_tree() -> list[dict]:
    """doc ディレクトリのファイルツリーを返す（管理者のみ）。

    Returns:
        _build_tree の結果

    Raises:
        HTTPException(401): ログインしていない場合
        HTTPException(404): doc ディレクトリが存在しない場合
    """
    if not DOC_ROOT.exists():
        raise HTTPException(status_code=404, detail='doc directory not found')
    return _build_tree(DOC_ROOT, DOC_ROOT)


@router.get('/docs/content', response_class=PlainTextResponse)
def get_content(path: str = Query(...)) -> str:
    """指定パスの .md ファイルの内容をプレーンテキストで返す（管理者のみ）。

    ディレクトリトラバーサル攻撃を防ぐため、DOC_ROOT の外へのアクセスは拒否する。

    Args:
        path: DOC_ROOT からの相対パス（例: "design/overview.md"）

    Returns:
        ファイルの内容（UTF-8 プレーンテキスト）

    Raises:
        HTTPException(401): ログインしていない場合
        HTTPException(400): パスが不正またはディレクトリトラバーサルが検出された場合
        HTTPException(404): ファイルが存在しないまたは .md でない場合
    """
    # 1. 実際の場所に直し、DOC_ROOT の中にあるか確かめる（「../」などで外に出させない）
    try:
        target = (DOC_ROOT / path).resolve()
        target.relative_to(DOC_ROOT.resolve())
    except (ValueError, OSError):
        raise HTTPException(status_code=400, detail='invalid path')
    # 2. .md のファイルだけ返す
    if not target.exists() or not target.is_file() or target.suffix != '.md':
        raise HTTPException(status_code=404, detail='file not found')
    return target.read_text(encoding='utf-8')
