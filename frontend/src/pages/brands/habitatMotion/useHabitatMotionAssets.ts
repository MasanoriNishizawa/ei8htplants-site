import { usePageImageAssets } from '../../../lib/usePageImageAssets'

/**
 * Habitat Oides トップページの動く画像の URL を、管理画面で保存した値からまとめて取得する。
 * 3ブランド共通の usePageImageAssets（lib/usePageImageAssets.ts）に処理を任せる。
 * 1. GET /api/site-assets?prefix=habitat- で11枠を一度に取得する
 * 2. 取得に失敗しても止めず、localSrc（プロジェクト内の画像）か placeholder で表示を続ける
 * 3. 管理画面「ページ画像の編集」のプレビューでは、保存した値に草稿の URL を重ねて使う
 * 4. resolve(key) で、優先順（保存した URL → localSrc → null）に従った表示用の URL を返す
 * @returns resolve: キーから表示する画像 URL（なければ null）を返す関数 / loaded: 取得が終わったら true（失敗しても true）
 */
export function useHabitatMotionAssets() {
  return usePageImageAssets('habitat-oides')
}
