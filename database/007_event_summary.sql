-- ─────────────────────────────────────────────────────────────
-- BE on BSV — add events.summary
-- Apply via Supabase SQL editor (or `supabase db query --linked --file …`).
--
-- A short tagline shown on event cards. Separate from `description`
-- (which is now rich-text HTML) — summary is plain text capped at 200
-- chars. UI falls back to a truncated description when summary is null
-- so existing rows render unchanged.
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists summary text;

alter table public.events
  add constraint events_summary_len_chk
    check (summary is null or char_length(summary) <= 200);
