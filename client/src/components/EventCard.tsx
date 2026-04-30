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
          {/* Cover — auto-generated from the title for visual consistency
              across the grid. Uploaded `cover_url` is intentionally not used
              here; it's still rendered on the event-detail hero. */}
          <div className="aspect-[16/9] relative overflow-hidden bg-bsva-navy flex-none">
            <AutoCover title={event.title} seed={event.id} />
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full glass-strong text-white text-xs font-display font-semibold">
              {formatEventDate(event.starts_at)} · {formatEventTime(event.starts_at)}
            </div>
          </div>

          {/* Content — flex column with reserved heights so every card lines up */}
          <div className="p-6 flex flex-col flex-1">
            {/* Title — exactly 2 lines reserved */}
            <h3 className="font-display font-semibold text-xl text-bsva-navy leading-snug mb-2 line-clamp-2 min-h-[3.25rem]">
              {event.title}
            </h3>

            {/* Location — exactly 1 line reserved (renders empty when missing so the row stays) */}
            <div className="text-bsva-soft/60 text-sm font-body mb-3 truncate min-h-[1.25rem]">
              {event.is_virtual ? "Online" : event.location ?? ""}
            </div>

            {/* Summary — exactly 2 lines reserved. Falls back to a
                truncated description for legacy rows that don't have a
                summary set yet. Description may be HTML; strip tags
                before showing a teaser. */}
            <p className="text-bsva-soft/70 text-sm font-body line-clamp-2 mb-4 min-h-[2.5rem]">
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

/**
 * Auto-generated card cover. BSVA brand: navy/blue gradient ground, two
 * triangles (cyan apex on the bright corner, blue inset on the opposite),
 * event title centred. Deterministic per event via the `seed` prop so the
 * same card looks the same across reloads — currently used to vary the
 * triangle orientation a little.
 */
function AutoCover({ title, seed }: { title: string; seed: string }) {
  const flip = hashCode(seed) % 2 === 0;
  const gradId = `grad-${seed}`;
  return (
    <div className="w-full h-full relative bg-gradient-to-br from-bsva-navy via-bsva-blue/30 to-bsva-soft flex items-center justify-center overflow-hidden">
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00E6FF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#003FFF" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {flip ? (
          <>
            <polygon points="320,0 320,180 140,0" fill={`url(#${gradId})`} />
            <polygon points="320,0 320,90 230,0" fill="#00E6FF" opacity="0.85" />
          </>
        ) : (
          <>
            <polygon points="0,0 0,180 180,0" fill={`url(#${gradId})`} />
            <polygon points="0,0 0,90 90,0" fill="#00E6FF" opacity="0.85" />
          </>
        )}
      </svg>
      <div className="relative font-display font-semibold text-white text-2xl sm:text-3xl px-8 text-center line-clamp-3 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
        {title}
      </div>
    </div>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
