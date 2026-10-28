"""ブランドドメインに残る旧 PWA ファイルを解除する応答を作成する。"""

from typing import Mapping, Optional

from fastapi.responses import Response


def create_brand_pwa_response(
    host: str,
    path: str,
    brand_domains: Mapping[str, tuple],
) -> Optional[Response]:
    """ブランドドメインの旧 PWA ファイルに対する解除用 JavaScript 応答を作成する。

    呼び出し側で正規化された host と path を受け取り、ブランドドメイン上の
    ``sw.js`` または ``registerSW.js`` にだけ従来と同じ本文・ヘッダーで応答する。

    Args:
        host: 小文字化済みのリクエスト Host。
        path: 前後のスラッシュを除去済みのリクエストパス。
        brand_domains: ブランドドメイン名をキーとするブランド情報の対応表。

    Returns:
        対象ファイルへの JavaScript 応答。対象外の host または path なら None。
    """
    # 1. ブランドドメイン上の Service Worker 本体には、キャッシュ解除と登録解除の処理を返す。
    if host in brand_domains and path == 'sw.js':
        # 変数の内容: cleanup_worker: 旧 Service Worker とキャッシュを解除し、開いている画面を再読み込みする JavaScript 本文。
        # JavaScript 内の変数: windows は制御対象の画面一覧、key は削除するキャッシュ名、client は再読み込みする画面。
        cleanup_worker = """self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  await self.registration.unregister();
  await self.clients.claim();
  await Promise.all(windows.map(client => client.navigate(client.url).catch(() => undefined)));
})()));"""
        # 変数の内容: headers: 解除用スクリプトをキャッシュさせないための応答ヘッダー。
        headers = {'Cache-Control': 'no-store, no-cache, must-revalidate'}
        return Response(
            content=cleanup_worker,
            media_type='application/javascript',
            headers=headers,
        )

    # 2. ブランドドメイン上の登録スクリプトには、新しい Service Worker 登録を維持する本文を返す。
    if host in brand_domains and path == 'registerSW.js':
        # 変数の内容: register_cleanup_worker: 旧 Service Worker の解除処理を登録する JavaScript 本文。
        register_cleanup_worker = "if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})); }"
        # 変数の内容: headers: 解除用スクリプトをキャッシュさせないための応答ヘッダー。
        headers = {'Cache-Control': 'no-store, no-cache, must-revalidate'}
        return Response(
            content=register_cleanup_worker,
            media_type='application/javascript',
            headers=headers,
        )

    # 3. ブランドドメイン上の対象パス以外は、通常の SPA ルート処理に委ねる。
    return None
