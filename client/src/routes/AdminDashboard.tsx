import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Event } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { getSupabase } from "../lib/supabase.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { formatEventDateTime } from "../lib/format.js";

export function AdminDashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setError("Supabase auth is not configured.");
      setAuthReady(true);
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/admin/login");
        return;
      }
      setAuthReady(true);
      api.events
        .list("upcoming")
        .then((r) => setEvents(r.events))
        .catch((e) => setError(e instanceof ApiError ? e.message : "failed"));
    });
  }, [navigate]);

  async function signOut() {
    await getSupabase()?.auth.signOut();
    navigate("/admin/login");
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this event? This is reversible from the database.")) return;
    try {
      await api.admin.deleteEvent(id);
      setEvents((prev) => (prev ? prev.filter((e) => e.id !== id) : prev));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "delete failed");
    }
  }

  if (!authReady) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-6xl mx-auto px-6 pt-12 pb-24"
    >
      <header className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-bsva-cyan text-xs font-display font-semibold uppercase tracking-wider mb-1">
            Admin
          </div>
          <h1 className="font-display font-semibold text-4xl text-white">Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/events/new">
            <Button variant="primary">+ New event</Button>
          </Link>
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      {error && (
        <GlassCard className="p-6 text-white/80 mb-6">
          {error}
        </GlassCard>
      )}

      <GlassCard>
        <div className="divide-y divide-white/10">
          {events?.map((e) => (
            <div
              key={e.id}
              className="p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="min-w-0">
                <div className="font-display font-semibold text-white text-lg truncate">
                  {e.title}
                </div>
                <div className="text-white/60 font-body text-sm">
                  {formatEventDateTime(e.starts_at)}
                </div>
              </div>
              <div className="flex gap-2">
                <Link to={`/admin/events/${e.id}/registrations`}>
                  <Button variant="secondary">Registrations</Button>
                </Link>
                <Link to={`/admin/events/${e.id}/edit`}>
                  <Button variant="ghost">Edit</Button>
                </Link>
                <Button variant="ghost" onClick={() => onDelete(e.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {events && events.length === 0 && (
            <div className="p-10 text-center text-white/60 font-body">
              No events yet. Click <strong>+ New event</strong> to create one.
            </div>
          )}
        </div>
      </GlassCard>
    </motion.div>
  );
}
