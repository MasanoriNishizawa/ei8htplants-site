import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import BrandSiteLayout, { type BrandSiteConfig } from '../../components/BrandSiteLayout'
import PageLoading from '../../components/PageLoading'
import { BRAND } from '../../lib/brands'

const HabitatOides = lazy(() => import('../../pages/brands/HabitatOides'))
const HabitatOidesWorkshop = lazy(() => import('../../pages/brands/HabitatOidesWorkshop'))
const Collaborations = lazy(() => import('../../pages/Collaborations'))

export const habitatOidesSite: BrandSiteConfig = {
  key: 'habitat-oides', name: BRAND.habitatOides.name, descriptor: 'Habitat Style Materials & Plants',
  origin: 'https://habitatoides.com', logo: BRAND.habitatOides.logo,
  instagramUrl: BRAND.habitatOides.instagramUrl, instagramHandle: BRAND.habitatOides.instagramHandle,
  accent: '#304c9b', sections: [{ href: '/#concept', label: 'Concept' }, { href: '/#workshop', label: 'Workshop' }, { href: '/collaborations', label: 'Collaboration' }],
}

/** Habitat Oides 専用ドメインのページ構成。既存 URL から来た訪問者も新しい URL に案内する。 */
export default function HabitatOidesSite() {
  return <Routes>
    <Route element={<BrandSiteLayout site={habitatOidesSite} />}>
      <Route index element={<Suspense fallback={<PageLoading />}><HabitatOides /></Suspense>} />
      <Route path="workshop" element={<Suspense fallback={<PageLoading />}><HabitatOidesWorkshop /></Suspense>} />
      <Route path="collaborations" element={<Suspense fallback={<PageLoading />}><Collaborations /></Suspense>} />
      <Route path="habitatoides" element={<Navigate to="/" replace />} />
      <Route path="habitatoides/workshop" element={<Navigate to="/workshop" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
