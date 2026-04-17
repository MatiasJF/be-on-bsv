-- ─────────────────────────────────────────────────────────────
-- BE on BSV — speakers support (multi-speaker events)
--
-- Adds two tables:
--   speakers          — people. Reusable across events.
--   event_speakers    — join table with role + position per event.
--
-- Also backfills existing events' flat host_* columns into the new
-- tables, so the migration is non-destructive: every event that had a
-- host_name keeps a speaker after this runs. The legacy host_* columns
-- on events are kept (marked DEPRECATED via SQL comment) for read-side
-- fallback on any row somehow missed by the backfill.
--
-- Fully idempotent — safe to re-run. Apply in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────

-- ── speakers ─────────────────────────────────────────────────
create table if not exists public.speakers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists speakers_name_idx on public.speakers (name);

drop trigger if exists speakers_set_updated_at on public.speakers;
create trigger speakers_set_updated_at
  before update on public.speakers
  for each row execute function public.set_updated_at();

-- ── event_speakers (join) ────────────────────────────────────
create table if not exists public.event_speakers (
  event_id    uuid not null references public.events(id) on delete cascade,
  speaker_id  uuid not null references public.speakers(id) on delete cascade,
  role        text not null default 'speaker' check (char_length(role) between 1 and 40),
  position    int  not null default 0,
  primary key (event_id, speaker_id)
);

create index if not exists event_speakers_event_idx on public.event_speakers (event_id, position);

-- ── RLS ──────────────────────────────────────────────────────
-- Public read (speakers appear on public event pages).
-- Writes only via service role from the Express server.
alter table public.speakers        enable row level security;
alter table public.event_speakers  enable row level security;

drop policy if exists "speakers: public read" on public.speakers;
create policy "speakers: public read"
  on public.speakers
  for select
  to anon, authenticated
  using (true);

drop policy if exists "event_speakers: public read" on public.event_speakers;
create policy "event_speakers: public read"
  on public.event_speakers
  for select
  to anon, authenticated
  using (true);

-- ── Backfill from legacy host_* columns ──────────────────────
-- Idempotent: skips events that already have at least one speaker linked.
do $$
declare
  e     record;
  s_id  uuid;
begin
  for e in
    select id, host_name, host_bio, host_avatar
    from public.events
    where host_name is not null
      and length(trim(host_name)) > 0
      and not exists (
        select 1 from public.event_speakers es where es.event_id = events.id
      )
  loop
    insert into public.speakers (name, bio, avatar_url)
      values (trim(e.host_name), e.host_bio, e.host_avatar)
      returning id into s_id;

    insert into public.event_speakers (event_id, speaker_id, role, position)
      values (e.id, s_id, 'host', 0);
  end loop;
end $$;

-- ── Mark legacy columns as deprecated (metadata only) ────────
comment on column public.events.host_name
  is 'DEPRECATED 003 — new writes go to event_speakers. Kept as read-side fallback for pre-migration rows.';
comment on column public.events.host_bio
  is 'DEPRECATED 003 — see host_name comment.';
comment on column public.events.host_avatar
  is 'DEPRECATED 003 — see host_name comment.';
