import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Event } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { EventCard } from "../components/EventCard.js";
import { GlassCard } from "../components/GlassCard.js";

export function PastEvents() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.events
      .list("past")
      .then((r) => setEvents(r.events))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "failed_to_load"));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-7xl mx-auto px-6 pt-16 pb-24"
    >
      <header className="mb-10">
        <h1 className="font-display font-semibold text-4xl sm:text-5xl text-bsva-navy mb-2">
          Past sessions
        </h1>
        <p className="text-bsva-soft/70 font-body">Catch up on what we've shipped.</p>
      </header>

      {error && <GlassCard className="p-6 text-bsva-soft">Couldn't load: {error}</GlassCard>}

      {events && events.length === 0 && (
        <GlassCard className="p-10 text-center text-bsva-soft/70 font-body">
          No past sessions yet.
        </GlassCard>
      )}

      {events && events.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
