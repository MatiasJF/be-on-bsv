-- ─────────────────────────────────────────────────────────────
-- BE on BSV — optional seed data for local dev
-- Not run automatically. Apply manually if you want sample events.
-- ─────────────────────────────────────────────────────────────

insert into public.events
  (title, description, starts_at, ends_at, location, is_virtual, tags, host_name, host_bio)
values
  (
    'Build Easy on BSV — Wallets in 60 minutes',
    'A live-coding session showing how to spin up a BSV wallet, fund it, and send your first transaction using @bsv/simple. Bring a laptop.',
    now() + interval '7 days',
    now() + interval '7 days 1 hour',
    'Online (Zoom link sent on registration)',
    true,
    array['workshop','beginner','wallets'],
    'BSV Association',
    'The folks behind the BSV Blockchain.'
  ),
  (
    'Build Easy on BSV — PushDrop Tickets',
    'Mint verifiable on-chain tickets for your own events. We''ll cover the full pattern: PushDrop creation, outpoint storage, and verification.',
    now() + interval '14 days',
    now() + interval '14 days 90 minutes',
    'Online',
    true,
    array['workshop','intermediate','tokens'],
    'BSV Association',
    null
  ),
  (
    'Build Easy on BSV — Identity & BRC-29 Payments',
    'How peer-to-peer payments work on BSV without an exchange in the middle. Hands-on with BRC-29.',
    now() - interval '21 days',
    now() - interval '21 days' + interval '90 minutes',
    'Online',
    true,
    array['workshop','intermediate','payments'],
    'BSV Association',
    null
  );
