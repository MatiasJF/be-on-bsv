# BE on BSV

A Luma-style event platform for the **Build Easy on BSV** session series, built on the BSV Association brand. Browse and register for upcoming sessions, get a verifiable on-chain "ticket" minted via `@bsv/simple`, and let admins manage events and export registrants.

> **For contributors and AI agents working in this repo: read [`CLAUDE.md`](./CLAUDE.md) first.** It is the source of truth for stack, brand rules, and conventions.

---

## What this repo gives you

| | Public visitors | Admins | What's on chain |
|---|---|---|---|
| **Stub mode** (`BSV_ENABLED=false`, default) | Browse events, register, get a deterministic `stub-…` txid + QR | Sign in via Supabase magic link, CRUD events, download CSVs | Nothing — stub txids never touch the chain |
| **Live mode** (`BSV_ENABLED=true`) | Same flow, but the txid is a **real** on-chain BRC-29 PushDrop ticket | Same plus a Wallet panel to fund the server wallet from a browser wallet | Each registration mints a 1-sat token in the `be-on-bsv-tickets` basket — verifiable on https://whatsonchain.com |

Stub mode lets you develop and demo the entire app with zero crypto dependencies. Flip the switch when you're ready to put real tickets on chain.

---

## Quick start (stub mode)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_JWT_SECRET, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

# 3. Apply database migrations to your Supabase project
#    Run database/001_init.sql then database/002_rls.sql in the Supabase SQL editor.
#    Optionally run database/seed.sql for sample events.

# 4. Start dev (client on :5173, server on :3000)
npm run dev
```

Then:

- **http://localhost:5173/** — public homepage with upcoming events
- **http://localhost:5173/admin/login** — admin sign-in (after you complete the admin setup below)

In production the server serves the built client on a single port:

```bash
npm run build
npm run start
```

### Making yourself an admin

The admin dashboard uses Supabase Auth. After you've created a user via **Authentication → Users → Add user** in your Supabase dashboard, run this in the SQL editor (substituting your email):

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'admin')
where email = 'you@example.com';
```

That gives the user the `app_metadata.role = 'admin'` claim that the `requireAdmin` middleware checks.

### Required Supabase **Site URL** for magic-link auth

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:5173` (or your prod URL)
- **Redirect URLs:** add `http://localhost:5173/**` so the magic link bounces back to your app

Without this, the magic-link email lands on the wrong host and the session never gets created in your browser.

---

## Activating live BSV mode

Live mode means **every registration creates a real on-chain BRC-29 PushDrop token** in the `be-on-bsv-tickets` basket. The server wallet needs (a) a private key and (b) some funded UTXOs. Both happen via the admin dashboard.

### Prereqs

- A BSV browser wallet that supports `@bsv/simple/browser`'s `createWallet()`. The canonical option is **[MetaNet Desktop (mainnet)](https://hub.bsvblockchain.org/demos-and-onboardings/onboardings/onboarding-catalog/metanet-desktop-mainnet)** — install via the BSV Blockchain Hub onboarding flow, free download for macOS/Windows/Linux. Install it and complete its first-run setup.
- A small amount of real BSV in that browser wallet. **A few thousand satoshis is enough** to mint hundreds of tickets at 1 sat each. You can pick that up from any BSV exchange or on-ramp; typical cost is a few cents.

### Server setup (one-time)

1. **Generate a server wallet private key.** From the repo root:

   ```bash
   npm --workspace server run bsv:generate-key
   ```

   This prints a fresh WIF (256-bit hex) inside a styled box, with the exact `.env` lines you need to paste. **Treat the WIF as a secret** — anyone with it can spend whatever you fund the wallet with.

2. **Open `.env` and set:**

   ```bash
   BSV_ENABLED=true
   BSV_SERVER_PRIVATE_KEY=<the WIF the script printed>

   # Optional — these have sensible defaults
   BSV_NETWORK=main                                # or "test"
   BSV_STORAGE_URL=https://storage.babbage.systems # wallet-toolbox storage backend
   BSV_TICKET_BASKET=be-on-bsv-tickets             # basket name for ticket tokens
   ```

3. **(Optional) Verify the wallet constructs** without starting the dev server:

   ```bash
   npm --workspace server run bsv:check
   ```

   Calls `getServerWalletInfo()` and prints `{ enabled, identityKey, network, basket, totalSatoshis, utxoCount, status }`. Exits 0 on success, 1 on failure. Useful for catching a bad WIF or unreachable storage backend before users see a 503 in the admin panel.

4. **Restart the dev server:** stop the running `npm run dev` (Ctrl+C) and start it again. The boot banner should now read:

   ```
   [be-on-bsv] server listening on http://localhost:3000  (env=development, bsv=live)
   ```

   If it still says `bsv=stub`, your `.env` change didn't get picked up — make sure you saved the file and that `BSV_ENABLED=true` is at the top level (not commented).

### Funding the server wallet (one-time, then top up as needed)

1. Open **http://localhost:5173/admin** and sign in.
2. The new **Wallet panel** at the top shows two glass cards.
3. **Left card — "Server wallet — Live"** — confirms the wallet is up. You'll see the identity key (a 33-byte hex pubkey), network, basket, status `connected`, and balance `0 sats`.
4. **Right card — "Fund from your browser wallet"** — click **Connect browser wallet**. MetaNet Desktop will pop up asking you to approve the connection. Approve it.
5. Enter an amount in sats (default 5000) and click **Send**. Approve the tx in MetaNet Desktop.
6. Within ~1.5 seconds the panel refreshes the server-side balance. You should see the new sats arrive in the left card, and the right card displays the funding txid.
7. **Verify on chain** by pasting the txid into https://whatsonchain.com.

### What happens on the next registration

Visit any event detail page (e.g. http://localhost:5173/) and submit the registration form. The confirmation page (`/r/<id>`) will show:

- A **real txid** (no `stub-` prefix) that you can look up on whatsonchain
- A QR code encoding the outpoint (`<txid>.<vout>`) — useful for a future check-in tool

The server wallet's balance drops by 1 sat per ticket, plus a tiny mining fee per tx. A 5000-sat balance covers thousands of tickets in practice.

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Boot banner says `bsv=stub` after restart | `.env` not saved, or `BSV_ENABLED` is in a comment / typo'd. Run `npm --workspace server run bsv:check` to confirm the env is being read. |
| `bsv:check` exits 1 with `ServerWallet.create` error | Bad WIF format, or `https://storage.babbage.systems` is unreachable. Check network + try again. |
| Wallet panel left card shows `Stub mode` after restart | Same as above — server didn't pick up the env change. |
| `Connect browser wallet` button shows "No BSV browser wallet detected" | MetaNet Desktop isn't installed or isn't running. Install it from https://hub.bsvblockchain.org/demos-and-onboardings/onboardings/onboarding-catalog/metanet-desktop-mainnet and launch it. |
| Funding tx broadcasts but balance stays at 0 | Server `receiveDirectPayment` failed — check the dev server log for `[unhandled]` errors. Most likely a derivation prefix/suffix mismatch. Open an issue. |
| First real registration fails with `createToken returned no txid` | The wallet has no spendable UTXOs (you funded with the wrong basket, or the UTXO hasn't confirmed yet). Check the left card — `utxoCount` should be ≥ 1. |

---

## Project layout

See [CLAUDE.md §2](./CLAUDE.md) for the full layout and rationale.

```
client/     React + Vite + Tailwind front-end
server/     Express + TypeScript REST API
shared/     Zod schemas and types used by both
database/   Supabase SQL migrations
```

Key entry points:

- `server/src/services/bsv.ts` — `mintRegistrationTicket`, `getServerWalletInfo`, `createServerPaymentRequest`, `receiveServerPayment`
- `server/src/routes/admin.ts` — `/api/admin/wallet/info`, `/api/admin/wallet/funding-request`
- `server/scripts/generate-key.ts` — `npm --workspace server run bsv:generate-key`
- `server/scripts/check-wallet.ts` — `npm --workspace server run bsv:check`
- `client/src/components/WalletPanel.tsx` — admin dashboard wallet UI
- `client/src/lib/wallet.ts` — `useWallet`, `fundServerWallet`, `useServerWalletInfo`

## Tests

```bash
npm run test          # vitest, currently 16 server-side integration tests
npm run typecheck     # tsc --noEmit across all workspaces
```

## Brand assets

The BSVA brand archives at the repo root (`00_BSVA_Style_Guidelines.zip`, `01_BSVA_Brand_Master_Assets.zip`) are **gitignored** and not committed. Only the specific files listed in [CLAUDE.md §5](./CLAUDE.md) are extracted into `client/`. If you need a new asset, add it to that table first, then extract just that file.

## License

Brand assets © BSV Association. Application code: TBD.
