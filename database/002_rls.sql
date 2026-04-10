-- ─────────────────────────────────────────────────────────────
-- BE on BSV — row-level security
--
-- Strategy:
--   • events:        public can SELECT non-deleted rows.
--                    Only the service role (used by our server) can write.
--   • registrations: public can INSERT (the public registration form).
--                    Only the service role can SELECT/UPDATE/DELETE
--                    (admin dashboard goes through the server).
--
-- The Express server uses the service-role key, which bypasses RLS by design.
-- These policies protect the database from anyone hitting Supabase directly
-- with the anon key (e.g. the browser client used for admin auth).
-- ─────────────────────────────────────────────────────────────

alter table public.events        enable row level security;
alter table public.registrations enable row level security;

-- ── events ───────────────────────────────────────────────────
drop policy if exists "events: public read active" on public.events;
create policy "events: public read active"
  on public.events
  for select
  to anon, authenticated
  using (deleted_at is null);

-- No insert/update/delete policies for anon/authenticated — only the
-- service role (used server-side) can write.

-- ── registrations ────────────────────────────────────────────
drop policy if exists "registrations: public insert" on public.registrations;
create policy "registrations: public insert"
  on public.registrations
  for insert
  to anon, authenticated
  with check (true);

-- No select/update/delete for anon/authenticated. The admin dashboard
-- reads via the server, which uses the service-role key.

-- ── storage policies for event-covers bucket ─────────────────
-- Anyone can read; only service role can write (default behaviour
-- when no insert/update/delete policies exist).
drop policy if exists "event-covers: public read" on storage.objects;
create policy "event-covers: public read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'event-covers');
