-- ─────────────────────────────────────────────────────────────
-- BE on BSV — add ordinal columns to registrations
-- Apply via Supabase SQL editor (or `supabase db query --linked --file …`).
--
-- Each registration now mints two on-chain artifacts:
--   • PushDrop ticket  (existing tx_id / outpoint)        — used by the
--     future check-in/redeem flow (`wallet.redeemToken`).
--   • 1sat-ord ticket  (new ord_txid / ord_outpoint)      — the visible,
--     shareable artifact that ord-aware viewers render directly as SVG.
--
-- Both columns are nullable so registrations can succeed even when one of
-- the two mints fails — the admin retry endpoint backfills later.
-- ─────────────────────────────────────────────────────────────

alter table public.registrations
  add column if not exists ord_txid text,
  add column if not exists ord_outpoint text,
  add column if not exists ord_metadata_sha256 text;

create index if not exists registrations_ord_pending_idx
  on public.registrations (event_id)
  where ord_txid is null;
