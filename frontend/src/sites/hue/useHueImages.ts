import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

/** 管理画面で登録したHUEの6枚の写真を取得する。 */
export function useHueImages() {
  const [images, setImages] = useState<string[]>(Array(6).fill(''))

  useEffect(() => {
    let active = true
    Promise.all(Array.from({ length: 6 }, (_, index) =>
      api.siteAssets.get(`hue-color-${String(index + 1).padStart(2, '0')}`)
        .then(({ url }) => url)
        .catch(() => ''),
    )).then((urls) => {
      if (active) setImages(urls)
    })
    return () => { active = false }
  }, [])

  return images
}
