-- ─────────────────────────────────────────────────────────────
-- BE on BSV — add meeting_url to events
-- Apply via Supabase SQL editor (or `supabase db push`).
--
-- Adds an optional URL where registrants of a virtual event can join.
-- Only meaningful when is_virtual = true; the UI hides the field for
-- in-person events. Public listings never expose this — it's surfaced
-- only post-registration (confirmation page + email).
-- ─────────────────────────────────────────────────────────────

alter table public.events
  add column if not exists meeting_url text;
