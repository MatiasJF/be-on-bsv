import { Route, Routes } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { Nav } from "./components/Nav.js";
import { Footer } from "./components/Footer.js";
import { Home } from "./routes/Home.js";
import { EventDetail } from "./routes/EventDetail.js";
import { RegisterConfirmed } from "./routes/RegisterConfirmed.js";
import { AdminGate } from "./routes/AdminGate.js";
import { AdminLogin } from "./routes/AdminLogin.js";
import { AdminDashboard } from "./routes/AdminDashboard.js";
import { AdminEventForm } from "./routes/AdminEventForm.js";
import { AdminRegistrations } from "./routes/AdminRegistrations.js";
import { NotFound } from "./routes/NotFound.js";

export default function App() {
  const location = useLocation();
  return (
    <div className="relative min-h-dvh flex flex-col">
      <Nav />
      <main className="flex-1 relative z-10">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<Home />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/r/:id" element={<RegisterConfirmed />} />
            {/* Magic-link entry stays open so invited admins can sign in
                without the dashboard gate. The gate is for the dashboard
                surfaces below — it stops casual visitors from poking at
                event-management UI while we're in private build mode. */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminGate><AdminDashboard /></AdminGate>} />
            <Route
              path="/admin/events/new"
              element={
                <AdminGate>
                  <AdminEventForm mode="create" />
                </AdminGate>
              }
            />
            <Route
              path="/admin/events/:id/edit"
              element={
                <AdminGate>
                  <AdminEventForm mode="edit" />
                </AdminGate>
              }
            />
            <Route
              path="/admin/events/:id/registrations"
              element={
                <AdminGate>
                  <AdminRegistrations />
                </AdminGate>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}
