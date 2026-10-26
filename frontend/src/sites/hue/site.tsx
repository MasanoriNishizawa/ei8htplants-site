import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import BrandSiteLayout, { type BrandSiteConfig } from '../../components/BrandSiteLayout'
import PageLoading from '../../components/PageLoading'
import { BRAND } from '../../lib/brands'

const Hue = lazy(() => import('../../pages/brands/Hue'))

export const hueSite: BrandSiteConfig = {
  key: 'hue', name: BRAND.hue.name, descriptor: '植物と暮らす', descriptorEn: 'Live with plants',
  origin: 'https://huebyei8htplants.com', logo: BRAND.hue.logo,
  instagramUrl: BRAND.hue.instagramUrl, instagramHandle: BRAND.hue.instagramHandle,
  accent: '#947454', sections: [{ href: '/#point-of-view', label: 'Concept', labelJa: 'HUEの考え方' }],
}

/** HUE 専用ドメインのページ構成。ブランドページを独立したトップとして提供する。 */
export default function HueSite() {
  return <Routes>
    <Route element={<BrandSiteLayout site={hueSite} />}>
      <Route index element={<Suspense fallback={<PageLoading />}><Hue /></Suspense>} />
      <Route path="hue" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
