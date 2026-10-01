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


# バケットが未作成の場合に作成する（既存の場合は例外を無視する）
def _ensure_bucket():
    """画像バケットが存在しない場合に作成する。既存の場合は例外を無視する。"""
    try:
        admin_supabase.storage.create_bucket(BUCKET, {'public': True})
    except Exception as e:
        print(f'[upload] bucket ensure: {e}')


# 動画バケットが未作成の場合に作成する
def _ensure_video_bucket():
    """動画バケットが存在しない場合に作成する。既存の場合は例外を無視する。"""
    try:
        admin_supabase.storage.create_bucket(VIDEO_BUCKET, {'public': True})
    except Exception as e:
        print(f'[upload] video bucket ensure: {e}')


# 画像ファイル（JPEG/PNG/WebP/GIF、最大10MB）をSupabaseストレージにアップロードし公開URLを返す
@router.post('')
async def upload_image(file: UploadFile = File(...), _=Depends(require_auth)):
    """画像ファイルをSupabaseストレージにアップロードし、公開URLを返す。

    JPEG/PNG/WebP/GIF のみ対応、最大10MBまで。

    Args:
        file: アップロードするファイル（multipart/form-data）

    Returns:
        {"url": "<public_url>"} の辞書

    Raises:
        HTTPException(400): 非対応のファイル形式またはサイズ超過の場合
    """
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail='jpeg / png / webp / gif のみ対応しています')
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail='ファイルサイズは10MB以内にしてください')
    ext = (file.filename or 'image').rsplit('.', 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    _ensure_bucket()
    admin_supabase.storage.from_(BUCKET).upload(
        filename, data, {
            'contentType': file.content_type or 'application/octet-stream',
            'cacheControl': '31536000',
        }
    )
    public_url = admin_supabase.storage.from_(BUCKET).get_public_url(filename)
    return {'url': public_url}


# 動画ファイル（MP4/MOV/WebM、最大500MB）をSupabaseストレージにアップロードし公開URLを返す
@router.post('/video')
async def upload_video(file: UploadFile = File(...), _=Depends(require_auth)):
    """動画ファイルをSupabaseストレージにアップロードし、公開URLを返す。

    MP4/MOV/WebM のみ対応、最大500MBまで。

    Args:
        file: アップロードする動画ファイル（multipart/form-data）

    Returns:
        {"url": "<public_url>"} の辞書

    Raises:
        HTTPException(400): 非対応のファイル形式またはサイズ超過の場合
    """
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=400, detail='mp4 / mov / webm のみ対応しています')
    data = await file.read()
    if len(data) > MAX_VIDEO_SIZE:
        raise HTTPException(status_code=400, detail='ファイルサイズは500MB以内にしてください')
    ext = (file.filename or 'video').rsplit('.', 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    _ensure_video_bucket()
    admin_supabase.storage.from_(VIDEO_BUCKET).upload(
        filename, data, {
            'contentType': file.content_type or 'video/mp4',
            'cacheControl': '31536000',
        }
    )
    public_url = admin_supabase.storage.from_(VIDEO_BUCKET).get_public_url(filename)
    return {'url': public_url}
