import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { usePageImageEdit } from '../../lib/pageImageEdit'
import { HUE_PAGE_SLOTS } from '../../lib/pageImageSlots'

/**
 * 管理画面で登録した HUE の6枚のトップページ写真を取得する。
 * 管理画面「ページ画像の編集」のプレビュー（編集モード）では、草稿の URL がある枠はそちらを返す（保存するまで公開ページは変わらない）。
 * @returns 表示順に並んだ6件の画像 URL。未登録または取得失敗時は空文字
 */
export function useHueImages() {
  // 管理画面のプレビューの編集モードの値（ふつうの公開ページでは null）
  const edit = usePageImageEdit()
  /** 各写真の URL。初期値と未登録枠は空文字にする */
  const [images, setImages] = useState<string[]>(Array(6).fill(''))

  useEffect(() => {
    // 画面を離れたあとに応答が届いて state を更新しないための有効フラグ
    let active = true
    // 1. 6つの固定キーを並行取得し、個別の失敗は空の画像枠として扱う
    Promise.all(Array.from({ length: 6 }, (_, index) =>
      api.siteAssets.get(`hue-color-${String(index + 1).padStart(2, '0')}`)
        .then(({ url }) => url)
        .catch(() => ''),
    )).then((urls) => {
      if (active) setImages(urls)
    })
    // 2. 画面を離れるときに後続の state 更新を止める
    return () => { active = false }
  }, [])

  // 3. 編集モードでは、草稿に含まれる枠だけ草稿の URL に置き換える（含まれない枠は保存した値のまま）
  if (edit?.editMode) {
    return HUE_PAGE_SLOTS.map(({ key }, index) => edit.draftUrls[key] ?? images[index] ?? '')
  }
  return images
}
