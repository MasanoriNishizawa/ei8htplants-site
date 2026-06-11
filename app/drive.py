"""
app/drive.py
============
Google Drive API を使ったギャラリー画像取得モジュール。

画像 URL の生成は sheets.py の get_display_url() を共用している。
ギャラリーデータはイベントデータより変化頻度が低いため、
キャッシュ TTL を長め（600 秒 = 10 分）に設定している。
"""

import random

from .cache import cache
from .config import FOLDERS
from .google_client import get_drive
from .sheets import get_display_url


def get_gallery_images(brand: str = "ei8ht_plants", page_size: int = 100) -> list[str]:
    """
    指定ブランドのギャラリーフォルダから画像 URL のリストを返す。

    Args:
        brand:     フォルダを選択するためのブランドキー（config.FOLDERS のキー）
        page_size: Drive API から取得する最大ファイル数

    キャッシュキー例: "gallery:ei8ht_plants:100"
    フォルダ内の画像が増減しても最大 10 分は古いリストが返ることに注意。
    """
    cache_key = f"gallery:{brand}:{page_size}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 存在しないブランドキーが渡された場合は ei8ht_plants にフォールバック
    folder_id = FOLDERS.get(brand, FOLDERS["ei8ht_plants"])

    # Drive API クエリ: 指定フォルダ内の画像ファイルをゴミ箱以外から取得
    query = f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
    results = (
        get_drive()
        .files()
        .list(q=query, fields="files(id)", pageSize=page_size)
        .execute()
    )
    images = [get_display_url(item["id"]) for item in results.get("files", [])]

    # ギャラリーは変化が少ないので TTL を長め（10 分）に設定
    cache.set(cache_key, images, ttl=600)
    return images


def get_home_gallery_images() -> list[str]:
    """
    ホームページのマーキーセクション用に、全ブランドの画像をまとめて取得する。

    各ブランドフォルダから最大 8 枚ずつ取得してシャッフルし、
    毎回違う順番で表示されるようにしている。

    シャッフル後のリストはキャッシュするため、TTL の間は同じ順序が維持される。
    """
    cache_key = "gallery:home"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    all_images = []
    for folder_id in FOLDERS.values():
        query = (
            f"'{folder_id}' in parents and mimeType contains 'image/' and trashed = false"
        )
        results = (
            get_drive()
            .files()
            .list(q=query, fields="files(id)", pageSize=8)
            .execute()
        )
        all_images.extend(
            [get_display_url(item["id"]) for item in results.get("files", [])]
        )

    # マーキーの見た目に変化を持たせるためシャッフル（キャッシュ後は固定）
    random.shuffle(all_images)
    cache.set(cache_key, all_images, ttl=600)
    return all_images
