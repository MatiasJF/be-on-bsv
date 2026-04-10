-- ─────────────────────────────────────────────────────────────
-- BE on BSV — initial schema
-- Apply via Supabase SQL editor (or `supabase db push`).
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── events ───────────────────────────────────────────────────
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 200),
  description   text not null check (char_length(description) > 0),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text,
  is_virtual    boolean not null default false,
  cover_url     text,
  tags          text[] not null default '{}',
  host_name     text,
  host_bio      text,
  host_avatar   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists events_starts_at_idx on public.events (starts_at);
create index if not exists events_tags_idx      on public.events using gin (tags);
create index if not exists events_active_idx    on public.events (deleted_at) where deleted_at is null;

-- Auto-bump updated_at on UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ── registrations ────────────────────────────────────────────
create table if not exists public.registrations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 320),
  organization  text,
  tx_id         text,
  outpoint      text,
  created_at    timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists registrations_event_idx      on public.registrations (event_id);
create index if not exists registrations_created_at_idx on public.registrations (created_at desc);

-- ── storage bucket for event cover images ───────────────────
-- Created here so the project can be re-initialised idempotently.
-- Public read so cover images can be served via direct URLs.
insert into storage.buckets (id, name, public)
  values ('event-covers', 'event-covers', true)
  on conflict (id) do nothing;
