# Database

Postgres schema for BE on BSV. Hosted on Supabase.

## Files

| File | Purpose |
|---|---|
| `001_init.sql` | Tables, indexes, triggers, storage bucket. |
| `002_rls.sql`  | Row-level security policies. |
| `seed.sql`     | Optional sample events for local dev. |

## Applying

The simplest path is the **Supabase SQL editor**:

1. Open your project at https://app.supabase.com
2. SQL Editor → New Query
3. Paste `001_init.sql`, run.
4. Paste `002_rls.sql`, run.
5. (Optional) Paste `seed.sql`, run.

## Authentication notes

- Public users do NOT need accounts to register for events.
- Admins use **Supabase Auth** (magic link or OAuth). The Express server checks the JWT and looks for the `app_metadata.role = 'admin'` claim before allowing writes.
- To make a user an admin, in Supabase SQL editor:
  ```sql
  update auth.users
  set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'admin')
  where email = 'you@example.com';
  ```

## Service role vs anon

- The **Express server** uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS by design — it owns all writes.
- The **React client** uses `SUPABASE_ANON_KEY` (via `VITE_SUPABASE_*`) only for Supabase Auth (admin login). It never reads events or registrations directly — everything goes through `/api/*`.
- RLS exists as a safety net in case anyone hits Supabase with the anon key.
