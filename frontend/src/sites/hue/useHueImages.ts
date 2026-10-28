import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/**
 * 管理画面で登録した HUE の6枚のトップページ写真を取得する。
 * @returns 表示順に並んだ6件の画像 URL。未登録または取得失敗時は空文字
 */
export function useHueImages() {
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

  return images
}
