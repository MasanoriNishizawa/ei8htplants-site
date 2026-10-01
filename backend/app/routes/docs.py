from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
import os
import pathlib

router = APIRouter()

DOC_ROOT = pathlib.Path(__file__).parent.parent.parent.parent / 'doc'


# ドキュメントディレクトリを再帰的に走査し、.mdファイルのみのツリー構造を返す
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
    items = []
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


# docディレクトリのファイルツリーを返す
@router.get('/docs/tree')
def get_tree():
    """doc ディレクトリのファイルツリーを返す。

    Raises:
        HTTPException(404): doc ディレクトリが存在しない場合
    """
    if not DOC_ROOT.exists():
        raise HTTPException(status_code=404, detail='doc directory not found')
    return _build_tree(DOC_ROOT, DOC_ROOT)


# 指定パスの.mdファイルの内容をプレーンテキストで返す。ディレクトリトラバーサル対策を含む
@router.get('/docs/content', response_class=PlainTextResponse)
def get_content(path: str = Query(...)):
    """指定パスの .md ファイルの内容をプレーンテキストで返す。

    ディレクトリトラバーサル攻撃を防ぐため、DOC_ROOT の外へのアクセスは拒否する。

    Args:
        path: DOC_ROOT からの相対パス（例: "design/overview.md"）

    Returns:
        ファイルの内容（UTF-8 プレーンテキスト）

    Raises:
        HTTPException(400): パスが不正またはディレクトリトラバーサルが検出された場合
        HTTPException(404): ファイルが存在しないまたは .md でない場合
    """
    # Prevent directory traversal
    try:
        target = (DOC_ROOT / path).resolve()
        target.relative_to(DOC_ROOT.resolve())
    except (ValueError, Exception):
        raise HTTPException(status_code=400, detail='invalid path')
    if not target.exists() or not target.is_file() or target.suffix != '.md':
        raise HTTPException(status_code=404, detail='file not found')
    return target.read_text(encoding='utf-8')
