import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { Event } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { EventCard } from "../components/EventCard.js";
import { CalendarMonthGrid, CalendarWeekGrid } from "../components/CalendarGrid.js";
import { Button } from "../components/Button.js";
import { GlassCard } from "../components/GlassCard.js";

export function Home() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"cards" | "month" | "week">("cards");

  useEffect(() => {
    api.events
      .list("upcoming")
      .then((r) => setEvents(r.events))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "failed_to_load"));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-16 sm:pt-24 pb-12">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-bsva-ice text-bsva-blue text-xs font-display font-semibold uppercase tracking-wider mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-bsva-blue animate-pulse" />
            Build Easy on BSV
          </div>
          <h1 className="font-display font-semibold text-5xl sm:text-6xl md:text-7xl text-bsva-navy leading-[0.95] mb-6">
            Ship on BSV.
            <br />
            <span className="text-bsva-blue">In one session.</span>
          </h1>
          <p className="text-bsva-soft/80 text-lg sm:text-xl font-body max-w-2xl mb-8 leading-relaxed">
            Live workshops where builders learn the BSV stack, mint their first transaction,
            and walk away with code that works. Together <span className="text-bsva-blue">▶</span> Towards Better.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#events">
              <Button variant="primary">Browse upcoming events</Button>
            </a>
            <a
              href="https://hub.bsvblockchain.org/demos-and-onboardings/onboardings/onboarding-catalog/metanet-desktop-mainnet"
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="secondary">Install MetaNet Desktop ↗</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Events */}
      <section id="events" className="max-w-7xl mx-auto px-6 pb-24">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h2 className="font-display font-semibold text-3xl sm:text-4xl text-bsva-navy mb-2">
              Upcoming sessions
            </h2>
          </div>
          <div className="inline-flex glass rounded-full p-1">
            {(["cards", "month", "week"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setView(opt)}
                className={`px-4 py-2 rounded-full text-sm font-display font-semibold capitalize transition-all ${
                  view === opt
                    ? "bg-bsva-cyan text-bsva-navy"
                    : "text-white/70 hover:text-white"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <GlassCard className="p-6 text-white/80">
            Couldn't load events: <span className="text-bsva-cyan">{error}</span>
          </GlassCard>
        )}

        {!events && !error && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <GlassCard key={i} className="aspect-[4/3] animate-pulse" children={null} />
            ))}
          </div>
        )}

        {events && events.length === 0 && (
          <GlassCard className="p-10 text-center">
            <div className="text-white/70 font-body">No upcoming sessions yet. Check back soon.</div>
          </GlassCard>
        )}

        {events && events.length > 0 && view === "cards" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} />
            ))}
          </div>
        )}

        {events && events.length > 0 && view === "month" && (
          <CalendarMonthGrid events={events} />
        )}

        {events && events.length > 0 && view === "week" && (
          <CalendarWeekGrid events={events} />
        )}
      </section>
    </motion.div>
  );
}
