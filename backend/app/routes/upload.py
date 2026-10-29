"""画像・動画を Supabase Storage にアップロードする API（管理者のみ）。

拡張子は利用者が付けたファイル名ではなく、申告された種類（Content-Type）から決める。
さらにファイルの先頭のバイト（マジックナンバー）で、申告どおりの種類かを確かめる
（画像と偽った HTML などを公開バケットに置かれないようにするため）。
バケット（images・videos）は、プロセスで最初のアップロードのときに 1 回だけ「無ければ作る」を呼ぶ
（以前は毎回呼んでいた。本番にバケットがあるか確かめられていないため、呼び出し自体は残している）。
"""
import logging
import threading
import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..auth import require_auth
from ..db import admin_supabase

# 変数の内容: logger: モジュール名を使って記録するロガー、router: この API 群のルーター。
logger = logging.getLogger(__name__)

# main.py から登録する、このモジュールの FastAPI エンドポイントをまとめるルーター。
router = APIRouter(prefix='/upload', tags=['upload'])

# 画像を置く公開バケット
BUCKET = 'images'
# 動画を置く公開バケット
VIDEO_BUCKET = 'videos'
# 画像の最大サイズ（10 MB）
MAX_SIZE = 10 * 1024 * 1024
# 動画の最大サイズ（500 MB）
MAX_VIDEO_SIZE = 500 * 1024 * 1024
# アップロードしたファイルに付ける Cache-Control の max-age（秒）。ファイル名は毎回新しいので 1 年
_CACHE_CONTROL_SECONDS = '31536000'

# 受け付ける画像の種類 → 拡張子
IMAGE_EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
}
# 受け付ける動画の種類 → 拡張子
VIDEO_EXTENSIONS = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-m4v': 'm4v',
}
# 受け付ける画像の種類（以前の名前。ほかから参照されてもよいよう残す）
ALLOWED_TYPES = set(IMAGE_EXTENSIONS)
# 受け付ける動画の種類（以前の名前）
ALLOWED_VIDEO_TYPES = set(VIDEO_EXTENSIONS)

# MP4・MOV・M4V（ISO BMFF / QuickTime）の 5〜8 バイト目に来る箱の名前
_ISO_BOX_TYPES = (b'ftyp',)
# 古い QuickTime（MOV）は ftyp の箱が無く、これらの箱から始まることがある
_QUICKTIME_BOX_TYPES = (b'ftyp', b'moov', b'mdat', b'wide', b'free', b'skip', b'pnot')


def _matches_signature(content_type: str, head: bytes) -> bool:
    """ファイルの先頭のバイトが申告された種類のものかを返す。

    Args:
        content_type: 申告された種類（IMAGE_EXTENSIONS・VIDEO_EXTENSIONS のキー）
        head: ファイルの先頭（16 バイト以上あるとよい）

    Returns:
        種類が合っていれば True
    """
    # 1. 申告された MIME 種類に対応するファイル先頭の署名を照合する。
    if content_type == 'image/jpeg':
        return head.startswith(b'\xff\xd8\xff')
    if content_type == 'image/png':
        return head.startswith(b'\x89PNG\r\n\x1a\n')
    if content_type == 'image/gif':
        return head.startswith((b'GIF87a', b'GIF89a'))
    if content_type == 'image/webp':
        return head[:4] == b'RIFF' and head[8:12] == b'WEBP'
    if content_type == 'video/webm':
        return head.startswith(b'\x1a\x45\xdf\xa3')
    if content_type == 'video/quicktime':
        return head[4:8] in _QUICKTIME_BOX_TYPES
    if content_type in ('video/mp4', 'video/x-m4v'):
        return head[4:8] in _ISO_BOX_TYPES
    return False


@dataclass(frozen=True)
class _UploadKind:
    """アップロードの種類ごとの設定（画像か動画か）。"""

    # 置くバケット
    bucket: str
    # 受け付ける種類 → 拡張子
    extensions: dict[str, str]
    # 最大サイズ（バイト）
    max_size: int
    # 種類が違うときの文言
    type_error: str
    # 大きすぎるときの文言
    size_error: str


# 画像のアップロードの設定
_IMAGE = _UploadKind(
    BUCKET, IMAGE_EXTENSIONS, MAX_SIZE,
    'jpeg / png / webp / gif のみ対応しています', 'ファイルサイズは10MB以内にしてください',
)
# 動画のアップロードの設定
_VIDEO = _UploadKind(
    VIDEO_BUCKET, VIDEO_EXTENSIONS, MAX_VIDEO_SIZE,
    'mp4 / mov / webm のみ対応しています', 'ファイルサイズは500MB以内にしてください',
)


# このプロセスで「無ければ作る」をもう呼んだバケットの名前（作成済み・既にあった場合だけ入れる）
_ensured_buckets: set[str] = set()
# _ensured_buckets を確かめて作成を呼ぶまでをひとまとまりにするロック（同時のアップロードで何度も呼ばないため）
_ensure_lock = threading.Lock()
# 作成に失敗したことをログに出したバケットの名前（ログを最初の 1 回だけにするため）
_ensure_failed_logged: set[str] = set()


def _ensure_bucket(bucket: str) -> None:
    """公開バケットが無ければ作る。プロセスで成功するまで、アップロードのたびに 1 回だけ試す。

    既にある場合も Supabase は例外を返すので、例外の内容に「already exists」などが入っていれば
    あるものとして扱う。それ以外の失敗はログに残し（最初の 1 回だけ）、アップロードはそのまま試みる
    （既存の動きと同じ。バケットがあればアップロードは成功する）。

    Args:
        bucket: バケットの名前（images か videos）

    Returns:
        なし。
    """
    if bucket in _ensured_buckets:
        return
    with _ensure_lock:
        # 1. ロックを待つ間に別のアップロードが済ませていれば何もしない
        if bucket in _ensured_buckets:
            return
        # 2. 作成を呼ぶ。作れた・既にあった場合は以後呼ばない
        try:
            admin_supabase.storage.create_bucket(bucket, {'public': True})
            _ensured_buckets.add(bucket)
            logger.info('ストレージのバケット %s を作成しました', bucket)
        # 変数の内容: e: except で捕捉した処理例外。
        except Exception as e:
            # 「already exists」「duplicate」だけを既にある扱いにする（「does not exist」などの失敗を成功とみなさない）
            # 変数の内容: message: 既存バケットかどうかを判定するために小文字化した例外文。
            message = str(e).lower()
            if 'already exist' in message or 'duplicate' in message:
                _ensured_buckets.add(bucket)
            elif bucket not in _ensure_failed_logged:
                # 3. それ以外の失敗はログに 1 回だけ残す（次のアップロードでまた作成を試す）
                _ensure_failed_logged.add(bucket)
                logger.warning('ストレージのバケット %s の確認・作成に失敗しました: %s', bucket, type(e).__name__)


def _store(file: UploadFile, kind: _UploadKind) -> dict:
    """ファイルを確かめてバケットに置き、公開 URL を返す（画像・動画で共通）。

    同期の関数なので、FastAPI がスレッドプールで呼ぶ（Supabase の同期の呼び出しでイベントループを止めない）。

    Args:
        file: アップロードされたファイル
        kind: 画像か動画かの設定

    Returns:
        {"url": "<public_url>"}

    Raises:
        HTTPException(400): 対応していない種類・中身が申告と違う・大きすぎる場合
    """
    # 1. 申告された種類を確かめ、拡張子を決める
    # 変数の内容: content_type: アップロード申告の MIME 種別、ext: 対応表から引いたファイル拡張子。
    content_type = file.content_type or ''
    ext = kind.extensions.get(content_type)
    if not ext:
        raise HTTPException(status_code=400, detail=kind.type_error)
    # 2. 上限 + 1 バイトまで読む（大きすぎるファイルを全部メモリに読まない）
    # 変数の内容: data: サイズとファイル署名を検証するために読み込んだファイル内容。
    data = file.file.read(kind.max_size + 1)
    if len(data) > kind.max_size:
        raise HTTPException(status_code=400, detail=kind.size_error)
    # 3. 先頭のバイトで中身が申告どおりか確かめる
    if not _matches_signature(content_type, data[:16]):
        raise HTTPException(status_code=400, detail='ファイルの中身が形式と一致しません')
    # 4. バケットが無ければ作る（プロセスで最初の 1 回だけ）
    _ensure_bucket(kind.bucket)
    # 5. 新しいファイル名で置き、公開 URL を返す
    # 変数の内容: filename: Storage 内で一意にするファイル名、storage: 対象バケットの Storage クライアント。
    filename = f'{uuid.uuid4()}.{ext}'
    storage = admin_supabase.storage.from_(kind.bucket)
    storage.upload(filename, data, {'contentType': content_type, 'cacheControl': _CACHE_CONTROL_SECONDS})
    return {'url': storage.get_public_url(filename)}


@router.post('')
def upload_image(file: UploadFile = File(...), _=Depends(require_auth)) -> dict:
    """画像ファイルをSupabaseストレージにアップロードし、公開URLを返す（管理者のみ）。

    JPEG/PNG/WebP/GIF のみ対応、最大10MBまで。

    Args:
        file: アップロードするファイル（multipart/form-data）
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"url": "<public_url>"} の辞書

    Raises:
        HTTPException(400): 非対応のファイル形式・中身が形式と違う・サイズ超過の場合
    """
    # 1. 画像ファイルをSupabaseストレージにアップロードし、公開URLを返す（管理者のみ）。
    return _store(file, _IMAGE)


@router.post('/video')
def upload_video(file: UploadFile = File(...), _=Depends(require_auth)) -> dict:
    """動画ファイルをSupabaseストレージにアップロードし、公開URLを返す（管理者のみ）。

    MP4/MOV/WebM（M4V）のみ対応、最大500MBまで。

    Args:
        file: アップロードする動画ファイル（multipart/form-data）
        _: 認証確認のために注入される値（この関数内では使用しません）。

    Returns:
        {"url": "<public_url>"} の辞書

    Raises:
        HTTPException(400): 非対応のファイル形式・中身が形式と違う・サイズ超過の場合
    """
    # 1. 動画ファイルをSupabaseストレージにアップロードし、公開URLを返す（管理者のみ）。
    return _store(file, _VIDEO)
