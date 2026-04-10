import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { Event } from "@be-on-bsv/shared";
import { GlassCard } from "./GlassCard.js";

interface CalendarGridProps {
  events: Event[];
}

/**
 * Monthly calendar grid view of events. Click any day with events to see them.
 */
export function CalendarGrid({ events }: CalendarGridProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      out.push(d);
    }
    return out;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = format(new Date(e.starts_at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 font-body text-sm"
        >
          ← Prev
        </button>
        <div className="font-display font-semibold text-xl text-white">
          {format(month, "MMMM yyyy")}
        </div>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 font-body text-sm"
        >
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-xs font-body text-white/50 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center py-2 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = isSameDay(d, new Date());
          const inMonth = isSameMonth(d, month);
          return (
            <div
              key={key}
              className={`min-h-[88px] rounded-lg p-2 border ${
                isToday
                  ? "border-bsva-cyan/60 bg-bsva-cyan/5"
                  : "border-white/5 bg-white/[0.02]"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <div
                className={`text-xs font-body mb-1 ${
                  isToday ? "text-bsva-cyan font-semibold" : "text-white/60"
                }`}
              >
                {format(d, "d")}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((e) => (
                  <Link
                    key={e.id}
                    to={`/events/${e.id}`}
                    className="block truncate text-[11px] font-body text-white bg-bsva-blue/40 hover:bg-bsva-blue/70 rounded px-1.5 py-0.5"
                    title={e.title}
                  >
                    {e.title}
                  </Link>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-white/50 px-1.5">
                    +{dayEvents.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
