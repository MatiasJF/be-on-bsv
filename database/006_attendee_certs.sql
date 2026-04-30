-- ─────────────────────────────────────────────────────────────
-- BE on BSV — attendee certs + reward bookkeeping
-- Apply via Supabase SQL editor (or `supabase db query --linked --file …`).
--
-- The cert flow is a CTA to install MetaNet Desktop. Users connect their
-- wallet on the confirmation page and receive a cert bound to their
-- wallet identity key. After the event ends they can claim 100 sats from
-- the server wallet.
--
-- All columns are nullable — existing registrations continue to work.
-- The flow is opt-in and the meeting link is unconditional.
-- ─────────────────────────────────────────────────────────────

alter table public.registrations
  add column if not exists attendee_identity_key text,
  add column if not exists cert_serial text,
  add column if not exists cert_issued_at timestamptz,
  add column if not exists reward_sats integer,
  add column if not exists reward_txid text,
  add column if not exists reward_claimed_at timestamptz;

create index if not exists registrations_attendee_key_idx
  on public.registrations (attendee_identity_key)
  where attendee_identity_key is not null;
