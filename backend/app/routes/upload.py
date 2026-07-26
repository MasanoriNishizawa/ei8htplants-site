import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from ..db import admin_supabase
from ..auth import require_auth

BUCKET = 'images'
router = APIRouter(prefix='/upload', tags=['upload'])

ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


def _ensure_bucket():
    try:
        admin_supabase.storage.create_bucket(BUCKET, {'public': True})
    except Exception as e:
        print(f'[upload] bucket ensure: {e}')


@router.post('')
async def upload_image(file: UploadFile = File(...), _=Depends(require_auth)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail='jpeg / png / webp / gif のみ対応しています')
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail='ファイルサイズは10MB以内にしてください')
    ext = (file.filename or 'image').rsplit('.', 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    _ensure_bucket()
    admin_supabase.storage.from_(BUCKET).upload(
        filename, data, {'contentType': file.content_type or 'application/octet-stream'}
    )
    public_url = admin_supabase.storage.from_(BUCKET).get_public_url(filename)
    return {'url': public_url}
