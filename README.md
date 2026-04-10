# BE on BSV

A Luma-style event platform for the **Build Easy on BSV** session series, built on the BSV Association brand. Browse and register for upcoming sessions, get an on-chain "ticket" minted via `@bsv/simple`, and let admins manage events and export registrants.

> **For contributors and AI agents working in this repo: read [`CLAUDE.md`](./CLAUDE.md) first.** It is the source of truth for stack, brand rules, and conventions.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET

# 3. Apply database migrations to your Supabase project
#    Run database/001_init.sql and database/002_rls.sql in the Supabase SQL editor.

# 4. Start dev (client on :5173, server on :3000)
npm run dev
```

In production the server serves the built client on a single port:

```bash
npm run build
npm run start
```

## Project layout

See [CLAUDE.md §2](./CLAUDE.md) for the full layout and rationale.

```
client/     React + Vite + Tailwind front-end
server/     Express + TypeScript REST API
shared/     Zod schemas and types used by both
database/   Supabase SQL migrations
```

## Brand assets

The BSVA brand archives at the repo root (`00_BSVA_Style_Guidelines.zip`, `01_BSVA_Brand_Master_Assets.zip`) are **gitignored** and not committed. Only the specific files listed in [CLAUDE.md §5](./CLAUDE.md) are extracted into `client/`. If you need a new asset, add it to that table first, then extract just that file.

## License

Brand assets © BSV Association. Application code: TBD.
