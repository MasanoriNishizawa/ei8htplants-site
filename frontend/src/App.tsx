import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Events from './pages/Events'
import Gallery from './pages/Gallery'
import Concept from './pages/Concept'
import Contact from './pages/Contact'
import Stockists from './pages/Stockists'
import Ei8htPlants from './pages/brands/Ei8htPlants'
import HabitatOides from './pages/brands/HabitatOides'
import Hue from './pages/brands/Hue'
import Reserve from './pages/Reserve'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/Dashboard'
import AdminEvents from './pages/admin/Events'
import AdminEventForm from './pages/admin/EventForm'
import AdminGallery from './pages/admin/Gallery'
import AdminStockists from './pages/admin/Stockists'
import AdminReservations from './pages/admin/Reservations'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/events" element={<Events />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/concept" element={<Concept />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/stockists" element={<Stockists />} />
          <Route path="/ei8htplants" element={<Ei8htPlants />} />
          <Route path="/habitatoides" element={<HabitatOides />} />
          <Route path="/hue" element={<Hue />} />
          <Route path="/reserve" element={<Reserve />} />
        </Route>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="events/new" element={<AdminEventForm />} />
          <Route path="events/:id/edit" element={<AdminEventForm />} />
          <Route path="gallery" element={<AdminGallery />} />
          <Route path="stockists" element={<AdminStockists />} />
          <Route path="reservations" element={<AdminReservations />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
