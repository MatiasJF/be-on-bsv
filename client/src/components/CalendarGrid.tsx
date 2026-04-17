import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Event } from "@be-on-bsv/shared";
import { GlassCard } from "./GlassCard.js";

/** Legacy single-export keeps old imports working. Prefer MonthGrid/WeekGrid. */
export function CalendarGrid(props: { events: Event[]; view?: "month" | "week" }) {
  const { view = "month", events } = props;
  return view === "week" ? (
    <CalendarWeekGrid events={events} />
  ) : (
    <CalendarMonthGrid events={events} />
  );
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

function buildEventsByDay(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>();
  for (const e of events) {
    const key = format(new Date(e.starts_at), "yyyy-MM-dd");
    const arr = map.get(key) ?? [];
    arr.push(e);
    map.set(key, arr);
  }
  // Sort each day's events by start time so earliest is on top.
  for (const arr of map.values()) {
    arr.sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  }
  return map;
}

const DAY_LABELS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─────────────────────────────────────────────────────────────
// Monthly grid — 7 × 5/6 cells, one cell per day in the month.
// ─────────────────────────────────────────────────────────────

export function CalendarMonthGrid({ events }: { events: Event[] }) {
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

  const eventsByDay = useMemo(() => buildEventsByDay(events), [events]);

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
        {DAY_LABELS_SHORT.map((d) => (
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

// ─────────────────────────────────────────────────────────────
// Weekly grid — 7 columns, each a day, with a stack of events.
// Good for series where events are sparse and you want to see
// "what's happening this week" at a glance.
// ─────────────────────────────────────────────────────────────

export function CalendarWeekGrid({ events }: { events: Event[] }) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) {
      out.push(new Date(weekStart.getTime() + i * 86400000));
    }
    return out;
  }, [weekStart]);

  const eventsByDay = useMemo(() => buildEventsByDay(events), [events]);

  const weekLabel = `${format(days[0]!, "d MMM")} – ${format(
    days[6]!,
    "d MMM yyyy",
  )}`;

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button
          onClick={() => setWeekStart((w) => subWeeks(w, 1))}
          className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 font-body text-sm"
        >
          ← Prev week
        </button>
        <div className="font-display font-semibold text-xl text-white text-center">
          {weekLabel}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
            }
            className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 font-body text-sm"
          >
            This week
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="px-3 py-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 font-body text-sm"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {days.map((d, i) => {
          const key = format(d, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = isSameDay(d, new Date());
          return (
            <div
              key={key}
              className={`rounded-xl p-3 border min-h-[180px] ${
                isToday
                  ? "border-bsva-cyan/60 bg-bsva-cyan/5"
                  : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div
                className={`text-[11px] font-display font-semibold uppercase tracking-wider mb-1 ${
                  isToday ? "text-bsva-cyan" : "text-white/50"
                }`}
              >
                {DAY_LABELS_SHORT[i]}
              </div>
              <div
                className={`font-display font-semibold text-2xl mb-3 ${
                  isToday ? "text-bsva-cyan" : "text-white"
                }`}
              >
                {format(d, "d")}
              </div>

              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <Link
                    key={e.id}
                    to={`/events/${e.id}`}
                    className="block rounded-lg bg-bsva-blue/30 hover:bg-bsva-blue/60 border border-bsva-blue/50 hover:border-bsva-cyan/60 transition-colors px-2.5 py-2"
                    title={e.title}
                  >
                    <div className="text-[10px] font-display font-semibold text-bsva-cyan uppercase tracking-wider mb-0.5">
                      {format(new Date(e.starts_at), "HH:mm")}
                    </div>
                    <div className="text-xs font-body text-white line-clamp-2 leading-snug">
                      {e.title}
                    </div>
                  </Link>
                ))}
                {dayEvents.length === 0 && (
                  <div className="text-xs text-white/30 font-body italic">
                    —
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
