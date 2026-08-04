import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from ..db import admin_supabase
from ..auth import require_auth

BUCKET = 'images'
VIDEO_BUCKET = 'videos'
router = APIRouter(prefix='/upload', tags=['upload'])

ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
ALLOWED_VIDEO_TYPES = {'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'}
MAX_SIZE = 10 * 1024 * 1024       # 10 MB
MAX_VIDEO_SIZE = 500 * 1024 * 1024  # 500 MB


def _ensure_bucket():
    try:
        admin_supabase.storage.create_bucket(BUCKET, {'public': True})
    except Exception as e:
        print(f'[upload] bucket ensure: {e}')


def _ensure_video_bucket():
    try:
        admin_supabase.storage.create_bucket(VIDEO_BUCKET, {'public': True})
    except Exception as e:
        print(f'[upload] video bucket ensure: {e}')


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


@router.post('/video')
async def upload_video(file: UploadFile = File(...), _=Depends(require_auth)):
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail='mp4 / mov / webm のみ対応しています')
    data = await file.read()
    if len(data) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail='ファイルサイズは500MB以内にしてください')
    ext = (file.filename or 'video').rsplit('.', 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    _ensure_video_bucket()
    admin_supabase.storage.from_(VIDEO_BUCKET).upload(
        filename, data, {'contentType': file.content_type or 'video/mp4'}
    )
    public_url = admin_supabase.storage.from_(VIDEO_BUCKET).get_public_url(filename)
    return {'url': public_url}
