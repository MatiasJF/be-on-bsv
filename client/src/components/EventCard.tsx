import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { Event } from "@be-on-bsv/shared";
import { GlassCard } from "./GlassCard.js";
import { Tag } from "./Tag.js";
import { formatEventDate, formatEventTime } from "../lib/format.js";

interface EventCardProps {
  event: Event;
  index?: number;
}

export function EventCard({ event, index = 0 }: EventCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Link to={`/events/${event.id}`} className="block group h-full">
        <GlassCard className="h-full flex flex-col overflow-hidden transition-all duration-300 group-hover:scale-[1.015] group-hover:shadow-cyan-glow">
          {/* Cover — fixed aspect ratio, never grows */}
          <div className="aspect-[16/9] relative overflow-hidden bg-bsva-navy/40 flex-none">
            {event.cover_url ? (
              <img
                src={event.cover_url}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <CoverPlaceholder title={event.title} />
            )}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full glass-strong text-white text-xs font-display font-semibold">
              {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
            </div>
          </div>

          {/* Content — flex column with reserved heights so every card lines up */}
          <div className="p-6 flex flex-col flex-1">
            {/* Title — exactly 2 lines reserved */}
            <h3 className="font-display font-semibold text-xl text-white leading-snug mb-2 line-clamp-2 min-h-[3.25rem]">
              {event.title}
            </h3>

            {/* Location — exactly 1 line reserved (renders empty when missing so the row stays) */}
            <div className="text-white/60 text-sm font-body mb-3 truncate min-h-[1.25rem]">
              {event.is_virtual ? "Online" : event.location ?? ""}
            </div>

            {/* Summary — exactly 2 lines reserved. Falls back to a
                truncated description for legacy rows that don't have a
                summary set yet. Description may be HTML; strip tags
                before showing a teaser. */}
            <p className="text-white/70 text-sm font-body line-clamp-2 mb-4 min-h-[2.5rem]">
              {event.summary ?? stripTags(event.description).slice(0, 140)}
            </p>

            {/* Tags — pinned to the bottom of the card via mt-auto */}
            <div className="flex flex-wrap gap-2 mt-auto min-h-[1.75rem]">
              {event.tags.slice(0, 4).map((t) => (
                <Tag key={t} label={t} />
              ))}
            </div>
          </div>
        </GlassCard>
      </Link>
    </motion.div>
  );
}

/** Cheap HTML-to-text used to teaser-truncate Tiptap-formatted descriptions. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function CoverPlaceholder({ title }: { title: string }) {
  // Triangle motif placeholder, brand-aligned.
  return (
    <div className="w-full h-full relative bg-gradient-to-br from-bsva-navy via-bsva-blue/40 to-bsva-soft flex items-center justify-center overflow-hidden">
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full opacity-30"
        aria-hidden
      >
        <defs>
          <linearGradient id="t" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E6FF" />
            <stop offset="100%" stopColor="#003FFF" />
          </linearGradient>
        </defs>
        <polygon points="100,30 170,150 30,150" fill="url(#t)" />
      </svg>
      <div className="relative font-display font-semibold text-white/80 text-2xl px-6 text-center line-clamp-2">
        {title}
      </div>
    </div>
  );
}
