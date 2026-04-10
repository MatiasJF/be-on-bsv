# Build Easy on BSV — Events Platform

A Luma-style event platform for the **"Build Easy on BSV"** session series, built on the **BSV Association** brand. Users browse upcoming/past events, register, and download BSV Browser. Admins create/manage events and export registrants as CSV. Each registration mints a PushDrop "ticket" on-chain via `@bsv/simple`.

This file is the source of truth for project intent, stack, brand rules, and conventions. Read it before making non-trivial changes.

---

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Vite + React 18 + TypeScript** | SPA, no SSR. |
| Styling | **TailwindCSS** + custom BSVA theme tokens | Dark mode default; brand-compliant light mode toggle. |
| Animation | **Framer Motion** | Page transitions, card hovers, registration confirmation. |
| Routing | **React Router v6** | |
| Backend | **Node + Express + TypeScript** | REST. Single-port: serves `client/dist` in production. |
| Validation | **Zod** | Shared schemas in `/shared`. |
| Database | **Supabase (Postgres)** | Hosted. Used for data, auth, and storage (event cover images). |
| Auth | **Supabase Auth** | Admin-only routes; magic link or OAuth. Public users do NOT need accounts to register. |
| BSV | **`@bsv/simple/server`** | PushDrop "ticket" per registration. Server-side wallet from a private key (env). |
| Email | **Resend** | Registration confirmation (with QR). Falls back to console log if `RESEND_API_KEY` missing. |
| QR | **`qrcode`** | Server-rendered PNG embedded in confirmation email; client SVG on confirmation page. |
| CSV | **`csv-stringify`** | Streamed export. |
| Calendar UI | **`date-fns`** + custom grid | Toggle between card list and monthly view on homepage. |
| Deploy | Replit-friendly, but not Replit-only | Single-port architecture; no Replit-specific config files. |

---

## 2. Repository layout

```
/
├── CLAUDE.md                       # ← you are here
├── README.md                       # public-facing readme (separate from CLAUDE.md)
├── package.json                    # workspace root, npm workspaces
├── tsconfig.base.json              # shared TS config
├── .env.example                    # documented env vars (no secrets)
├── .gitignore
│
├── client/                         # Vite + React + TS
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts          # BSVA tokens live here
│   ├── postcss.config.cjs
│   ├── public/
│   │   └── fonts/                  # Chillax + Noto Sans, served as static
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/                 # one file per page
│       ├── components/             # reusable UI (Button, GlassCard, EventCard, …)
│       ├── lib/                    # api client, supabase client, formatters
│       ├── hooks/
│       ├── styles/
│       │   └── globals.css         # @font-face, base layer, brand CSS vars
│       └── assets/
│           └── brand/              # extracted from the master zip (see §5)
│
├── server/                         # Express + TS
│   ├── src/
│   │   ├── index.ts                # boots http + serves client/dist in prod
│   │   ├── env.ts                  # zod-validated env loader
│   │   ├── routes/
│   │   │   ├── events.ts
│   │   │   ├── registrations.ts
│   │   │   └── exports.ts
│   │   ├── middleware/
│   │   │   └── requireAdmin.ts     # validates Supabase JWT, checks admin claim
│   │   ├── services/
│   │   │   ├── supabase.ts         # service-role client
│   │   │   ├── bsv.ts              # @bsv/simple/server wrapper, PushDrop ticket
│   │   │   ├── email.ts            # Resend wrapper (no-op fallback)
│   │   │   └── csv.ts
│   │   └── lib/
│   └── tsconfig.json
│
├── database/                       # Supabase SQL migrations
│   ├── 001_init.sql                # tables, indexes
│   ├── 002_rls.sql                 # row-level security policies
│   └── seed.sql
│
├── shared/                         # types + zod schemas used by both sides
│   └── src/
│       ├── events.ts
│       └── registrations.ts
│
└── _brand_workspace/               # local-only reference (gitignored)
    └── BSVA_Style_Guide_May2025.pdf
```

The two BSVA zips at the repo root are **gitignored** and **never extracted in bulk** — see §5.

---

## 3. API endpoints

All under `/api`. Admin routes require a Supabase access token via `Authorization: Bearer <jwt>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/events` | public | List events. Query: `?status=upcoming\|past`, `?tag=...`, pagination. |
| `GET` | `/api/events/:id` | public | Event detail. |
| `POST` | `/api/events` | admin | Create event. Multipart for cover image → Supabase Storage. |
| `PUT` | `/api/events/:id` | admin | Update. |
| `DELETE` | `/api/events/:id` | admin | Soft delete (set `deleted_at`). |
| `POST` | `/api/register` | public | Register for an event. Mints PushDrop ticket, sends confirmation email. |
| `GET` | `/api/registrations/:eventId` | admin | List registrants for one event. |
| `GET` | `/api/export/:eventId` | admin | Streamed CSV: Name, Email, Organization, Timestamp, Event Name, TxID. |

Past/upcoming is derived from `events.starts_at` vs `now()` — no cron job required.

---

## 4. Database schema (high level)

```sql
events (
  id            uuid pk default gen_random_uuid(),
  title         text not null,
  description   text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  location      text,                  -- "virtual" or physical address
  is_virtual    boolean default false,
  cover_url     text,                  -- supabase storage public url
  tags          text[] default '{}',
  host_name     text,
  host_bio      text,
  host_avatar   text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted_at    timestamptz
);

registrations (
  id            uuid pk default gen_random_uuid(),
  event_id      uuid not null references events(id) on delete cascade,
  name          text not null,
  email         text not null,
  organization  text,
  tx_id         text,                  -- PushDrop ticket txid (nullable if BSV disabled)
  outpoint      text,                  -- "<txid>.<vout>"
  created_at    timestamptz default now(),
  unique (event_id, email)             -- one registration per email per event
);
```

RLS (`002_rls.sql`):
- `events`: anyone can `SELECT` non-deleted rows; only role `admin` can `INSERT/UPDATE/DELETE`.
- `registrations`: anyone can `INSERT`; only `admin` can `SELECT/DELETE`. The public confirmation page reads its own row by id from the API, not directly.

---

## 5. Brand assets — IMPORTANT rules

The two zips at the repo root are **off-limits for bulk extraction**:

| File | Size | Status |
|---|---|---|
| `00_BSVA_Style_Guidelines.zip` | 167 MB | Contains the style-guide PDF + PPTX. PDF is extracted to `_brand_workspace/` for reference. |
| `01_BSVA_Brand_Master_Assets.zip` | **19.8 GB** | ZIP64 archive, 817 entries. **Do NOT extract whole.** |

### Reading the master zip
Standard `unzip`, `bsdtar`, and `7z` (where installed) all fail on `01_BSVA_Brand_Master_Assets.zip` because of its size + ZIP64 layout. **Use Python's `zipfile` module**:

```bash
python3 - <<'PY'
import zipfile
z = zipfile.ZipFile("01_BSVA_Brand_Master_Assets.zip", "r")
for n in z.namelist():
    print(n)
PY
```

To extract a single file:
```bash
python3 - <<'PY'
import zipfile, shutil
z = zipfile.ZipFile("01_BSVA_Brand_Master_Assets.zip", "r")
src = "01_BSVA_Brand_Master_Assets/01_BSVA_Brand_Master_Assets/<path-inside-zip>"
with z.open(src) as a, open("client/src/assets/brand/<filename>", "wb") as b:
    shutil.copyfileobj(a, b)
PY
```

All zip paths are double-prefixed: `01_BSVA_Brand_Master_Assets/01_BSVA_Brand_Master_Assets/...`.

### What we use (and only what we use)
| Need | Source path inside zip | Destination |
|---|---|---|
| Primary white logo (linear) | `01_Logos/01_Logo_Only/01_Primary_Logo_Linear/MONO/SVG/BSV_ASSOCIATION_MONO_LOGO_WHITE_LINEAR_RGB.svg` | `client/src/assets/brand/logo-white-linear.svg` |
| Primary blue logo (linear, light mode) | `01_Logos/01_Logo_Only/01_Primary_Logo_Linear/RGB/SVG/BSV_ASSOCIATION_PRIMARY_LOGO_BLUE_LINEAR_RGB.svg` | `client/src/assets/brand/logo-blue-linear.svg` |
| Stacked white logo (mobile / hero) | `01_Logos/01_Logo_Only/02_Primary_Logo_Stacked/MONO/SVG/BSV_ASSOCIATION_MONO_LOGO_WHITE_STACKED_RGB.svg` | `client/src/assets/brand/logo-white-stacked.svg` |
| White tagline ("Together ▶ Towards Better") | `01_Logos/02_Tagline_Only/MONO - White/BSV_ASSOCIATION_TAGLINE_WHITE.svg` | `client/src/assets/brand/tagline-white.svg` |
| Chillax fonts | `04_Fonts/Chillax/Chillax-{Regular,Medium,Semibold}.otf` | `client/public/fonts/chillax/` |
| Noto Sans fonts | `04_Fonts/Noto Sans/NotoSans-{Regular,Medium,SemiBold,Bold}.ttf` | `client/public/fonts/noto-sans/` |
| Icons (subset) | `07_Icons/RGB_Digital/Blue/SVG/Blue_<name>_RGB.svg` (Time, Person, Padlock, Tick, Connections, Cube, Wallet, Speech) | `client/src/assets/brand/icons/` |

Anything not in this table is **not extracted**. If a new need arises, add a row here, then extract just that file.

### Brand tokens

```
Navy        #1B1EA9   rgb(27 30 169)
Blue        #003FFF   rgb(0 63 255)
Cyan        #00E6FF   rgb(0 230 255)   ← secondary accent (triangle apex)
Ice         #DAE3FF   rgb(218 227 255)
Grey        #EFF0F7   rgb(239 240 247)
Soft Black  #2D2D31   rgb(45 45 49)
White       #FFFFFF
```

These are mirrored as Tailwind colors under `theme.extend.colors.bsva.{navy, blue, cyan, ice, grey, soft, white}` in `client/tailwind.config.ts`, and as CSS variables in `client/src/styles/globals.css` so non-Tailwind code (e.g. SVG strokes, framer-motion variants) can use them.

### Typography rules (from style guide §06)
- **Chillax** = primary, used for headlines, key messaging, pull quotes. **Default weight: Semibold.** Always upper/lower case.
- **Noto Sans** = body. **Default weight: Regular.** Always upper/lower case.
- On **light** backgrounds: headlines in **Navy or Blue**, body in **Soft Black**.
- On **dark** backgrounds: headlines and body both in **White**.

Tailwind aliases:
```
font-display  → Chillax (default Semibold)
font-body     → Noto Sans (default Regular)
```

### Dark mode (default) — how we honor the brand AND get the Web3 vibe

The BSVA guide explicitly endorses dark mode (white-on-dark variants exist for every logo + the tagline). We treat **dark as the default** because the spec asks for a Web3 aesthetic, and we layer:

- **Background**: vertical gradient `Navy #1B1EA9 → Soft Black #2D2D31`, with the **tessellating triangle pattern** from §03 of the brand guide as a 6–8% opacity SVG overlay.
- **Surfaces (cards, modals, nav)**: glassmorphism — `background: rgba(255,255,255,0.06)`, `backdrop-filter: blur(20px) saturate(140%)`, `border: 1px solid rgba(255,255,255,0.10)`, `box-shadow: 0 8px 32px rgba(0,0,0,0.35)`.
- **Primary CTA**: solid `Blue #003FFF`, hover lift + cyan glow.
- **Interactive accent**: `Cyan #00E6FF` for links, focus rings, the on-chain "ticket minted" confirmation, and the apex of any decorative triangle.
- **Text**: white headlines (Chillax Semibold), white-90% body (Noto Sans Regular).
- **Logo in nav**: `logo-white-linear.svg`.

A **light mode toggle** is available, fully aligned with the official light system (Grey/Ice backgrounds, Navy headlines, Soft Black body, blue logo). This is the "fallback" theme; dark is the marketed look.

### Photography & illustration (when used)
Per §07 of the brand guide: photography is full-colour, framed in a large triangle that bleeds off one side, with an element of the subject breaking out. We **do not** invent imagery — if a hero image is needed, we either use a placeholder or copy a single approved photo from `05_Images/RGB_Digital/` (and add it to the table above). For v1 we lean on the triangle tessellation pattern instead of photos.

---

## 6. BSV integration (`@bsv/simple`)

### Why `@bsv/simple` and not `@bsv/sdk` directly
`@bsv/simple` is the high-level wrapper: it exposes `@bsv/simple/server` (server-side wallet from a private key, via `@bsv/wallet-toolbox`) and `@bsv/simple/browser` (client-side `WalletClient` from `@bsv/sdk`). For this app **all on-chain action happens server-side** so a user never needs a wallet to register.

### What we mint
On a successful registration we mint a **PushDrop "ticket"** containing:
- The event id (uuid)
- The registration id (uuid)
- A short label `BE-on-BSV`
- Issued-at timestamp

The resulting `txid` and `outpoint` are stored on the `registrations` row. The QR on the confirmation email/page encodes the outpoint, so a future "check-in" tool can verify it.

### Implementation skeleton
`server/src/services/bsv.ts` exposes:
```ts
export async function mintRegistrationTicket(input: {
  eventId: string;
  registrationId: string;
}): Promise<{ txid: string; outpoint: string }>;
```
- Wraps `createWallet` from `@bsv/simple/server` using `BSV_SERVER_PRIVATE_KEY` from env.
- If `BSV_ENABLED !== 'true'`, returns a deterministic stub `{ txid: 'stub-' + sha256(input).slice(0,32), outpoint: '...' }` so local dev works with no keys.
- Errors are caught and logged but **do not fail the registration** — the row is still inserted; `tx_id` is left null and the email goes out without a verifiable ticket. The admin dashboard surfaces failed mints.

### MCP note
There is an `@bsv/simple-mcp` server that exposes BSV tooling to Claude as MCP tools. Install:
```bash
claude mcp add simple-mcp -- npx -y @bsv/simple-mcp
```
Restart Claude Code after install. Once connected, the MCP can be used to inspect/test transactions during development. **The app does NOT depend on the MCP at runtime** — it talks to `@bsv/simple/server` directly.

---

## 7. Environment variables

All env vars are loaded once via `server/src/env.ts` (zod-validated). Document new vars here AND in `.env.example`.

| Var | Where | Required? | Purpose |
|---|---|---|---|
| `PORT` | server | no (default 3000) | HTTP port. |
| `NODE_ENV` | server | no | `development` \| `production`. |
| `SUPABASE_URL` | server | yes | Supabase project URL. |
| `SUPABASE_ANON_KEY` | server, client | yes | Public anon key (used by client; injected at build). |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | Service-role key. **Server only — never bundle.** |
| `SUPABASE_JWT_SECRET` | server | yes | Used to verify admin JWTs in `requireAdmin`. |
| `BSV_ENABLED` | server | no (default `false`) | Toggle the real PushDrop mint. `false` → stub. |
| `BSV_SERVER_PRIVATE_KEY` | server | only if `BSV_ENABLED=true` | WIF private key for the server wallet. |
| `RESEND_API_KEY` | server | no | Send real confirmation emails. Missing → console-log fallback. |
| `EMAIL_FROM` | server | only if `RESEND_API_KEY` set | e.g. `events@buildeasy.bsvassociation.org`. |
| `PUBLIC_APP_URL` | server | yes in prod | Used for confirmation links and QR payload. |
| `VITE_API_BASE` | client | no (default `/api`) | Override only for separate-host deploys. |

`.env.example` lives at the repo root. Real `.env` files are gitignored.

---

## 8. Commands

```bash
# from repo root
npm install                    # installs all workspaces

npm run dev                    # runs client (vite) + server (tsx watch) concurrently
npm run dev:client             # client only
npm run dev:server             # server only

npm run build                  # builds shared → server → client (in that order)
npm run start                  # runs the built server, which serves client/dist
npm run typecheck              # tsc --noEmit across all workspaces
npm run lint                   # eslint
npm run test                   # vitest (when tests exist)

# Supabase
npm run db:reset               # applies database/*.sql to local Supabase / hosted dev project
```

---

## 9. Conventions

- **TypeScript everywhere.** No `any` without an `eslint-disable-next-line` comment + reason.
- **Shared types** live in `/shared`. Both `client` and `server` import from `@app/shared`.
- **Zod first.** Validate at every system boundary (API request bodies, env, third-party responses). Derive TS types from schemas, not the other way around.
- **No silent failures.** Catch → log with context → surface a typed error to the caller. The BSV mint is the one explicit exception (see §6) and that's documented.
- **Tailwind for styling.** No CSS modules. Global styles only in `client/src/styles/globals.css`. Reusable patterns become small components, not utility class strings.
- **Brand-token discipline.** Never hardcode `#003FFF` or `Chillax` in component code — always go through `theme.colors.bsva.*` or `font-display`/`font-body`. This makes future brand updates a one-file change.
- **Server is stateless.** No in-memory caches that survive restart. Supabase is the only store.
- **Single-port deploy.** In prod the server statically serves `client/dist`, so the entire app is one URL. Replit-friendly out of the box.

---

## 10. Open items / known gaps

- [ ] BSV server wallet funding strategy — for v1 the server key needs a tiny UTXO balance to mint tickets. Document funding flow once the wallet keypair is generated.
- [ ] Decide whether the confirmation page should be public-link-by-id or require the email of the registrant.
- [ ] Calendar view: design only the month grid for v1; week view is backlog.
- [ ] Speakers: v1 stores host info as flat fields on `events`. If we need multiple speakers per event, promote to a `speakers` table + join.
- [ ] Build Easy logo / wordmark: there is no separate Build Easy mark — the page wordmark is set in Chillax Semibold over the BSVA primary logo. If a real BE-on-BSV mark appears later, add it to §5.
- [ ] simple-mcp is installed in the user's global Claude config but not visible in the current Claude session. After a Claude Code restart, future sessions can use it for in-context BSV tooling.

---

## 11. References

- BSVA Style Guide PDF: `_brand_workspace/BSVA_Style_Guide_May2025.pdf` (extracted from `00_BSVA_Style_Guidelines.zip`)
- `@bsv/simple` on npm: https://www.npmjs.com/package/@bsv/simple
- Supabase docs: https://supabase.com/docs
- Luma (visual reference for layout): https://lu.ma
