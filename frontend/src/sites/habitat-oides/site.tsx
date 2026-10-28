import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import BrandSiteLayout, { type BrandSiteConfig } from '../../components/BrandSiteLayout'
import PageLoading from '../../components/PageLoading'
import { BRAND } from '../../lib/brands'

// 各ページを必要になった時点で読み込み、ブランドサイトの初期表示を軽くする
const HabitatOides = lazy(() => import('../../pages/brands/HabitatOides'))
const HabitatOidesWorkshop = lazy(() => import('../../pages/brands/HabitatOidesWorkshop'))
const Collaborations = lazy(() => import('../../pages/Collaborations'))

/**
 * Habitat Oides ドメイン上の旧 HUE パスを HUE の専用ドメインへ転送する。
 * @returns 転送中に表示する読み込み表示
 */
function HueDomainRedirect() {
  // 1. 専用ドメインのトップへブラウザー遷移する
  useEffect(() => {
    window.location.replace('https://huebyei8htplants.com/')
  }, [])
  return <PageLoading />
}

/** Habitat Oides 専用ドメインの表示名・ロゴ・ナビゲーションなどの設定 */
export const habitatOidesSite: BrandSiteConfig = {
  key: 'habitat-oides', name: BRAND.habitatOides.name, descriptor: '植物の景色を仕立てる', descriptorEn: 'Shape a living landscape',
  origin: 'https://habitatoides.com', logo: BRAND.habitatOides.logo,
  instagramUrl: BRAND.habitatOides.instagramUrl, instagramHandle: BRAND.habitatOides.instagramHandle,
  accent: '#304c9b', sections: [
    { href: '/#world', label: 'Concept', labelJa: '世界観' },
    { href: '/#workshop', label: 'Workshop', labelJa: 'ワークショップ' },
    { href: '/collaborations', label: 'Collaboration', labelJa: 'コラボレーション' },
  ],
}

/**
 * Habitat Oides 専用ドメインのルートと共通レイアウトを描画し、既存 URL からの訪問者を案内する。
 * @returns ブランド共通レイアウト内のルート定義
 */
export default function HabitatOidesSite() {
  return <Routes>
    <Route element={<BrandSiteLayout site={habitatOidesSite} />}>
      <Route index element={<Suspense fallback={<PageLoading />}><HabitatOides /></Suspense>} />
      <Route path="workshop" element={<Suspense fallback={<PageLoading />}><HabitatOidesWorkshop /></Suspense>} />
      <Route path="collaborations" element={<Suspense fallback={<PageLoading />}><Collaborations /></Suspense>} />
      <Route path="hue/*" element={<HueDomainRedirect />} />
      <Route path="habitatoides" element={<Navigate to="/" replace />} />
      <Route path="habitatoides/workshop" element={<Navigate to="/workshop" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
