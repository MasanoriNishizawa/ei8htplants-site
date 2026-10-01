from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
import os
import pathlib

router = APIRouter()

DOC_ROOT = pathlib.Path(__file__).parent.parent.parent.parent / 'doc'


def _build_tree(directory: pathlib.Path, base: pathlib.Path) -> list[dict]:
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


@router.get('/docs/tree')
def get_tree():
    if not DOC_ROOT.exists():
        raise HTTPException(status_code=404, detail='doc directory not found')
    return _build_tree(DOC_ROOT, DOC_ROOT)


@router.get('/docs/content', response_class=PlainTextResponse)
def get_content(path: str = Query(...)):
    # Prevent directory traversal
    try:
        target = (DOC_ROOT / path).resolve()
        target.relative_to(DOC_ROOT.resolve())
    except (ValueError, Exception):
        raise HTTPException(status_code=400, detail='invalid path')
    if not target.exists() or not target.is_file() or target.suffix != '.md':
        raise HTTPException(status_code=404, detail='file not found')
    return target.read_text(encoding='utf-8')
