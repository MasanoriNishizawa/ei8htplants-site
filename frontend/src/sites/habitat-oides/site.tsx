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

/**
 * Habitat Oides 専用ドメインのブランド表示設定。
 * BrandSiteLayout がヘッダー・フッター・メタ情報を組み立てる際に参照する。
 */
export const habitatOidesSite: BrandSiteConfig = {
  /** サイト分岐やブランド固有の CSS クラスに使う識別子 */
  key: 'habitat-oides',
  /** ヘッダーやメタ情報に表示するブランド名 */
  name: BRAND.habitatOides.name,
  /** 日本語サイトでブランド名の下に表示する説明 */
  descriptor: '植物の景色を仕立てる',
  /** 英語サイトでブランド名の下に表示する説明 */
  descriptorEn: 'Shape a living landscape',
  /** canonical URL と共有メタ情報に使う専用ドメイン */
  origin: 'https://habitatoides.com',
  /** ヘッダーに表示するブランドロゴ */
  logo: BRAND.habitatOides.logo,
  /** 共通ヘッダーとフッターに表示する SNS 情報 */
  instagramUrl: BRAND.habitatOides.instagramUrl,
  /** Instagram リンクの横に表示するアカウント名 */
  instagramHandle: BRAND.habitatOides.instagramHandle,
  /** Habitat Oides のリンクやアクセントに使うテーマ色 */
  accent: '#304c9b',
  /** 共通ヘッダーに表示するトップページ内外の案内リンク */
  sections: [
    // トップページ内の各セクションと、独立したワークショップ・事例ページへのナビゲーション
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
