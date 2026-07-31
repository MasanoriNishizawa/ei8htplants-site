import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { CartProvider } from './lib/cart'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}
import Layout from './components/Layout'
import Home from './pages/Home'
import Events from './pages/Events'
import Gallery from './pages/Gallery'
import Concept from './pages/Concept'
import Contact from './pages/Contact'
import Stockists from './pages/Stockists'
import Collaborations from './pages/Collaborations'
import Ei8htPlants from './pages/brands/Ei8htPlants'
import HabitatOides from './pages/brands/HabitatOides'
import HabitatOidesWorkshop from './pages/brands/HabitatOidesWorkshop'
import Hue from './pages/brands/Hue'
import Reserve from './pages/Reserve'
import CancelReservation from './pages/CancelReservation'
import Shop from './pages/Shop'
import ShopProduct from './pages/ShopProduct'
import Checkout from './pages/Checkout'
import OrderComplete from './pages/OrderComplete'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminEvents from './pages/admin/Events'
import AdminEventForm from './pages/admin/EventForm'
import AdminGallery from './pages/admin/Gallery'
import AdminStockists from './pages/admin/Stockists'
import AdminReservations from './pages/admin/Reservations'
import AdminCollaborations from './pages/admin/Collaborations'
import AdminContacts from './pages/admin/Contacts'
import AdminEventFinance from './pages/admin/EventFinance'
import AdminEventReservations from './pages/admin/EventReservations'
import AdminEventSite from './pages/admin/AdminEventSite'
import AdminProducts from './pages/admin/Products'
import AdminOrders from './pages/admin/Orders'
import AdminArticles from './pages/admin/Articles'
import Journal from './pages/Journal'
import JournalArticle from './pages/JournalArticle'
import EventSite from './pages/EventSite'
import LegalPage from './pages/LegalPage'

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/events" element={<Events />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/concept" element={<Concept />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/stockists" element={<Stockists />} />
            <Route path="/collaborations" element={<Collaborations />} />
            <Route path="/ei8htplants" element={<Ei8htPlants />} />
            <Route path="/habitatoides" element={<HabitatOides />} />
            <Route path="/habitatoides/workshop" element={<HabitatOidesWorkshop />} />
            <Route path="/hue" element={<Hue />} />
            <Route path="/reserve" element={<Reserve />} />
            <Route path="/cancel" element={<CancelReservation />} />
            <Route path="/events/:id" element={<EventSite />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/shop/:id" element={<ShopProduct />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/complete" element={<OrderComplete />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/journal/:id" element={<JournalArticle />} />
            <Route path="/legal" element={<LegalPage />} />
          </Route>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="events/new" element={<AdminEventForm />} />
            <Route path="events/:id/edit" element={<AdminEventForm />} />
            <Route path="events/:id/finances" element={<AdminEventFinance />} />
            <Route path="events/:id/reservations" element={<AdminEventReservations />} />
            <Route path="events/:id/site" element={<AdminEventSite />} />
            <Route path="gallery" element={<AdminGallery />} />
            <Route path="stockists" element={<AdminStockists />} />
            <Route path="reservations" element={<AdminReservations />} />
            <Route path="collaborations" element={<AdminCollaborations />} />
            <Route path="contacts" element={<AdminContacts />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="articles" element={<AdminArticles />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CartProvider>
  )
}
