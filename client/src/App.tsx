import { Route, Routes } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Nav } from "./components/Nav.js";
import { Footer } from "./components/Footer.js";
import { TrianglePattern } from "./components/TrianglePattern.js";
import { Home } from "./routes/Home.js";
import { PastEvents } from "./routes/PastEvents.js";
import { EventDetail } from "./routes/EventDetail.js";
import { RegisterConfirmed } from "./routes/RegisterConfirmed.js";
import { AdminLogin } from "./routes/AdminLogin.js";
import { AdminDashboard } from "./routes/AdminDashboard.js";
import { AdminEventForm } from "./routes/AdminEventForm.js";
import { AdminRegistrations } from "./routes/AdminRegistrations.js";
import { NotFound } from "./routes/NotFound.js";

export default function App() {
  const location = useLocation();
  return (
    <div className="relative min-h-dvh flex flex-col">
      <TrianglePattern />
      <Nav />
      <main className="flex-1 relative z-10">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/past" element={<PastEvents />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/r/:id" element={<RegisterConfirmed />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/events/new" element={<AdminEventForm mode="create" />} />
            <Route path="/admin/events/:id/edit" element={<AdminEventForm mode="edit" />} />
            <Route path="/admin/events/:id/registrations" element={<AdminRegistrations />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}
