import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { usePageImageEdit } from './pageImageEdit'
import { PAGE_IMAGE_BRANDS, resolvePageImageSrc, type PageImageBrand } from './pageImageSlots'

/**
 * ブランドのトップページで差し替えられる画像の URL を、管理画面で保存した値からまとめて取得する。
 * 1. GET /api/site-assets?prefix=... でブランドの枠を一度に取得する
 * 2. 取得に失敗しても止めず、localSrc（プロジェクト内の画像）か null で表示を続ける
 * 3. 編集モード（管理画面のプレビュー）のときは、保存した値に草稿の URL を重ねて使う（保存するまで公開ページは変わらない）
 * 4. resolve(key) で、優先順（保存した URL・草稿 → localSrc → null）に従った表示用の URL を返す
 * @param brand - 対象のブランド
 * @returns resolve: キーから表示する画像 URL（なければ null）を返す関数 / loaded: 取得が終わったら true（失敗しても true）
 */
export function usePageImageAssets(brand: PageImageBrand) {
  // ブランドの設定（取得に使う prefix と枠の一覧）
  const config = PAGE_IMAGE_BRANDS[brand]
  // 編集モードの値（ふつうの公開ページでは null）
  const edit = usePageImageEdit()
  // 管理画面で保存した URL（キー → URL）。取得前・失敗時は空（すべて未設定扱い）
  const [remoteUrls, setRemoteUrls] = useState<Record<string, string>>({})
  // 一括取得が終わったか（成功・失敗のどちらでも true）
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // 画面を離れたあとに応答が届いて state を更新しないための有効フラグ
    let active = true
    api.siteAssets.list(config.prefix)
      .then((assets) => {
        // 1. 応答の配列を「キー → URL」の辞書にする
        if (active) setRemoteUrls(Object.fromEntries(assets.map(({ key, url }) => [key, url])))
      })
      .catch(() => {
        // 2. 失敗しても localSrc / null で表示できるので、何もしない
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    // 3. 画面を離れるときに後続の state 更新を止める
    return () => { active = false }
  }, [config.prefix])

  // 編集モードの草稿（ふつうの公開ページでは null）
  const draftUrls = edit?.editMode ? edit.draftUrls : null
  // 表示に使う URL（保存した値に、編集モードなら草稿を重ねたもの）
  const urls = useMemo(() => (draftUrls ? { ...remoteUrls, ...draftUrls } : remoteUrls), [remoteUrls, draftUrls])

  /**
   * キーの枠に表示する画像の URL を返す。
   * @param key - site_assets のキー（例: 'ei8ht-hero'）
   * @returns 表示する画像の URL。未設定で localSrc もない・定義にないキーなら null
   */
  const resolve = useCallback((key: string): string | null => {
    const slot = config.slots.find((item) => item.key === key)
    return slot ? resolvePageImageSrc(slot, urls) : null
  }, [config.slots, urls])

  return { resolve, loaded }
}
