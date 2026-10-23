import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import { CartProvider } from './lib/cart'
import { LangProvider } from './lib/lang'
import Layout from './components/Layout'
import StoreLayout from './components/StoreLayout'
import PageLoading from './components/PageLoading'
import LoadErrorBoundary from './components/LoadErrorBoundary'
import Home from './pages/Home'
import { adminPageLoaders } from './pages/admin/adminPages'

/**
 * ページ遷移時にスクロール位置をトップに戻すユーティリティコンポーネント（画面には何も出さない）
 * @returns null
 */
function ScrollToTop() {
  // 今のページのパス（クエリだけが変わったときは戻さない）
  const { pathname } = useLocation()
  // パス変更のたびにスクロールをリセット
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/*
 * 画面ごとの読み込み（コード分割）
 * トップ（Home）とレイアウト・計測など全ページで使う部品は通常の import で最初に読み、
 * それ以外のページは React.lazy で「そのページを開いたときに」別ファイルとして読み込む。
 * 管理画面（AdminLayout と /admin 以下の全ページ）も別ファイルになり、公開サイトの訪問者は管理画面のプログラムを読み込まない
 */

// 公開サイト（ブランドサイト・ショップ）のページ
const Events = lazy(() => import('./pages/Events'))
const Gallery = lazy(() => import('./pages/Gallery'))
const Concept = lazy(() => import('./pages/Concept'))
const Contact = lazy(() => import('./pages/Contact'))
const Stockists = lazy(() => import('./pages/Stockists'))
const Collaborations = lazy(() => import('./pages/Collaborations'))
const Ei8htPlants = lazy(() => import('./pages/brands/Ei8htPlants'))
const HabitatOides = lazy(() => import('./pages/brands/HabitatOides'))
const HabitatOidesWorkshop = lazy(() => import('./pages/brands/HabitatOidesWorkshop'))
const Hue = lazy(() => import('./pages/brands/Hue'))
const Reserve = lazy(() => import('./pages/Reserve'))
const CancelReservation = lazy(() => import('./pages/CancelReservation'))
const Shop = lazy(() => import('./pages/Shop'))
const ShopProduct = lazy(() => import('./pages/ShopProduct'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderComplete = lazy(() => import('./pages/OrderComplete'))

// 管理画面（/admin 以下）のレイアウトとページ。ページを読み込む関数は先読みと共用するため adminPages.ts にまとめている
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(adminPageLoaders.Dashboard)
const AdminEvents = lazy(adminPageLoaders.Events)
const AdminEventForm = lazy(adminPageLoaders.EventForm)
const AdminGallery = lazy(adminPageLoaders.Gallery)
const AdminStockists = lazy(adminPageLoaders.Stockists)
const AdminReservations = lazy(adminPageLoaders.Reservations)
const AdminCollaborations = lazy(adminPageLoaders.Collaborations)
const AdminContacts = lazy(adminPageLoaders.Contacts)
const AdminEventFinance = lazy(adminPageLoaders.EventFinance)
const AdminEventReservations = lazy(adminPageLoaders.EventReservations)
const AdminEventSite = lazy(adminPageLoaders.AdminEventSite)
const AdminProducts = lazy(adminPageLoaders.Products)
const AdminOrders = lazy(adminPageLoaders.Orders)
const AdminArticles = lazy(adminPageLoaders.Articles)
const AdminFinances = lazy(adminPageLoaders.Finances)
const PriceCalc = lazy(adminPageLoaders.PriceCalc)
const AdminPotArtists = lazy(adminPageLoaders.AdminPotArtists)
const AdminMedia = lazy(adminPageLoaders.AdminMedia)
const AdminDocs = lazy(adminPageLoaders.AdminDocs)
const AdminChatQA = lazy(adminPageLoaders.AdminChatQA)
const AdminChatLogs = lazy(adminPageLoaders.AdminChatLogs)
const AdminHelperPayment = lazy(adminPageLoaders.AdminHelperPayment)
const AdminWsSummary = lazy(adminPageLoaders.AdminWsSummary)
const AdminEventAdminInfo = lazy(adminPageLoaders.EventAdminInfo)
const AdminEventAdminInfoView = lazy(adminPageLoaders.EventAdminInfoView)
const AdminEventImages = lazy(adminPageLoaders.EventImages)
const AdminNotFound = lazy(adminPageLoaders.NotFound)

// 公開サイトのその他のページ（チャット・メディア・ジャーナル・イベントページ・規約）
const Chat = lazy(() => import('./pages/Chat'))
const Media = lazy(() => import('./pages/Media'))
const Journal = lazy(() => import('./pages/Journal'))
const JournalArticle = lazy(() => import('./pages/JournalArticle'))
const EventSite = lazy(() => import('./pages/EventSite'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
// 存在しない URL 用のページ
const NotFound = lazy(() => import('./pages/NotFound'))

/**
 * アプリ全体のルーティング定義。言語・カートの Context を最上位で提供する
 * @returns アプリ全体
 */
export default function App() {
  return (
    <LangProvider>
    {/* 分けたファイルの読み込み失敗などで画面全体が真っ白にならないよう、案内と再読み込みボタンに切り替える境界。
        案内を日英で出すため LangProvider の内側に置く */}
    <LoadErrorBoundary>
    <CartProvider>
      <BrowserRouter>
        <ScrollToTop />
        {/* いちばん外側の読み込み中表示。各レイアウトの中にも Suspense があるので、ここが出るのは
            管理画面のレイアウト（AdminLayout）自体を最初に読み込むあいだだけ */}
        <Suspense fallback={<PageLoading />}>
        <Routes>
          {/* ブランドサイト側のページ（大きいヘッダー・フッター・チャットボタン付き） */}
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/events" element={<Events />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/concept" element={<Concept />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/stockists" element={<Stockists />} />
            <Route path="/collaborations" element={<Collaborations />} />
            <Route path="/media" element={<Media />} />
            <Route path="/ei8htplants" element={<Ei8htPlants />} />
            <Route path="/habitatoides" element={<HabitatOides />} />
            <Route path="/habitatoides/workshop" element={<HabitatOidesWorkshop />} />
            <Route path="/hue" element={<Hue />} />
            <Route path="/events/:id" element={<EventSite />} />
            <Route path="/legal" element={<LegalPage />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/reserve" element={<Reserve />} />
            <Route path="/cancel" element={<CancelReservation />} />
            {/* どのページにも当たらない URL は「ページが見つかりません」（公開サイトのレイアウトの中に出す） */}
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* ショップ・ジャーナル側のページ（コンパクトなヘッダー） */}
          <Route element={<StoreLayout />}>
            <Route path="/shop" element={<Shop />} />
            <Route path="/shop/:id" element={<ShopProduct />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/:id" element={<JournalArticle />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/complete" element={<OrderComplete />} />
          </Route>
          {/* 管理画面（ログインが必要。AdminLayout がログイン画面とサイドメニューを出す） */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="events/new" element={<AdminEventForm />} />
            <Route path="events/:id/edit" element={<AdminEventForm />} />
            <Route path="events/:id/finances" element={<AdminEventFinance />} />
            <Route path="events/:id/reservations" element={<AdminEventReservations />} />
            <Route path="events/:id/site" element={<AdminEventSite />} />
            {/* 管理情報: 確認画面と、その「編集」ボタンから開く編集画面 */}
            <Route path="events/:id/admin-info" element={<AdminEventAdminInfoView />} />
            <Route path="events/:id/admin-info/edit" element={<AdminEventAdminInfo />} />
            <Route path="events/:id/images" element={<AdminEventImages />} />
            <Route path="gallery" element={<AdminGallery />} />
            <Route path="stockists" element={<AdminStockists />} />
            <Route path="reservations" element={<AdminReservations />} />
            <Route path="collaborations" element={<AdminCollaborations />} />
            <Route path="contacts" element={<AdminContacts />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="articles" element={<AdminArticles />} />
            <Route path="finances" element={<AdminFinances />} />
            <Route path="price-calc" element={<PriceCalc />} />
            <Route path="pot-artists" element={<AdminPotArtists />} />
            <Route path="media" element={<AdminMedia />} />
            <Route path="docs" element={<AdminDocs />} />
            <Route path="chat-qa" element={<AdminChatQA />} />
            <Route path="chat-logs" element={<AdminChatLogs />} />
            <Route path="helper-payment" element={<AdminHelperPayment />} />
            <Route path="ws-summary" element={<AdminWsSummary />} />
            {/* 管理画面の中で当たらない URL は、公開サイトの 404 ではなく管理画面のレイアウトの中で案内する */}
            <Route path="*" element={<AdminNotFound />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </CartProvider>
    </LoadErrorBoundary>
    </LangProvider>
  )
}
