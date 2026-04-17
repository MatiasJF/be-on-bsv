# Key rotation runbook

A stepped checklist for rotating every secret this project uses. Each section is self-contained — safe to rotate any one without touching the others, as long as you update every place that secret lands.

> **Context:** During development several secrets landed in chat/ session history, including the Supabase JWT secret, anon key, service-role key, BSV dev WIF, Resend API key, and the Render API key. For a dev/demo project this is fine. Before going "real" (significant funding, public marketing, etc.) do a full sweep of this file.

## Where each secret lives

| Secret | Local `.env` | Render service env | Supabase dashboard | Other |
|---|---|---|---|---|
| `SUPABASE_JWT_SECRET` | ✔ | ✔ | ⚠ source of truth — changing it invalidates all existing access tokens + regenerates anon/service_role keys | — |
| `SUPABASE_ANON_KEY` | ✔ | ✔ (also as `VITE_SUPABASE_ANON_KEY`) | ⚠ derived from JWT secret | — |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | ✔ | ⚠ derived from JWT secret | — |
| `BSV_SERVER_PRIVATE_KEY` (dev) | ✔ | — | — | Funded wallet — see §3 below |
| `BSV_SERVER_PRIVATE_KEY` (prod) | — | ✔ | — | Separate funded wallet from dev |
| `RESEND_API_KEY` | ✔ (optional) | ✔ | — | [resend.com dashboard](https://resend.com/api-keys) |
| `EMAIL_FROM` | ✔ | ✔ | — | Domain verified with Resend |
| `RENDER_API_KEY` | Shell env | — | — | [Render account settings](https://dashboard.render.com/settings#api-keys) |

## §1. Rotate the Supabase JWT secret

**Blast radius:** this is the nuclear option. Rotating the JWT secret also regenerates the anon + service_role keys, and invalidates every access token issued to every user. Every admin user will have to sign in again.

1. Supabase dashboard → **Project Settings → API → JWT Settings**
2. Click **Generate new JWT Secret**. Confirm the warning.
3. Note the three new values from the same page:
   - new **JWT Secret** (the one you just generated)
   - new **anon** `public` key (regenerated)
   - new **service_role** `secret` key (regenerated)
4. Update your local `.env`:
   ```
   SUPABASE_JWT_SECRET=<new jwt secret>
   SUPABASE_ANON_KEY=<new anon key>
   SUPABASE_SERVICE_ROLE_KEY=<new service_role key>
   VITE_SUPABASE_ANON_KEY=<new anon key>  # same value as above
   ```
   Restart `npm run dev`.
5. Update the same four values in Render env vars. Use the dashboard or the API:
   ```bash
   # via the Render MCP (if connected) — update_environment_variables tool
   # OR directly via the REST API:
   curl -X PUT \
     -H "Authorization: Bearer $RENDER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '<full array with updated values>' \
     'https://api.render.com/v1/services/srv-d7cemr57vvec73b5esug/env-vars'
   ```
   Trigger a redeploy so the new values take effect:
   ```bash
   render deploys create srv-d7cemr57vvec73b5esug --confirm
   ```
6. Sign yourself in again at `/admin/login` with your admin email — your previous session was invalidated.

## §2. Rotate only the anon / service_role keys (without touching JWT secret)

Supabase doesn't expose a "rotate just one key" button — keys are derived from the JWT secret. If you just want to invalidate existing keys without full session wipe, the safest path is still §1.

## §3. Rotate the BSV server wallet WIF

**Blast radius:** changing the WIF changes the server wallet's **identity key** (the address funds send to). A rotated wallet is a *fresh* wallet with zero sats — you'll need to move any funds across from the old one first.

**If the wallet is unfunded** (or you don't care about the funds):

1. Generate a fresh WIF:
   ```bash
   npm --workspace server run bsv:generate-key
   ```
2. Paste it into the target env:
   - **Local dev:** replace `BSV_SERVER_PRIVATE_KEY` in `.env`, restart `npm run dev`
   - **Render prod:** update the Render env var via dashboard or API, trigger redeploy
3. Verify the new identity key appears in the admin wallet panel.

**If the wallet has a meaningful balance you want to preserve:**

1. Fresh-WIF + fund cycle above with the NEW key.
2. While the old WIF is still active, use `@bsv/simple/server`'s `wallet.pay({ to: newIdentityKey, satoshis })` to move balance across (or do it from a browser wallet that controls the old key).
3. Wait for confirmation on whatsonchain.
4. Only then swap the env var to the new WIF.

**Local dev vs prod:** as of today these use **different** WIFs intentionally. Local dev: `506f7d…` (funded on mainnet during dev). Prod: `b44f6d…` (fresh, unfunded at time of writing). Don't merge these.

## §4. Rotate the Resend API key

**Blast radius:** the key is only used server-side for sending registration confirmation emails. No user-facing effects — worst case is a few emails drop into the console fallback for a few minutes while you swap keys.

1. [resend.com/api-keys](https://resend.com/api-keys) → **Create API key** → copy
2. Same key → `.env` (local) + Render env var (prod), for `RESEND_API_KEY`
3. Revoke the old key on the same page
4. Restart dev / redeploy prod

## §5. Rotate the Render API key itself

**Blast radius:** anyone with the old key loses CLI/MCP access to the service. You'll need to re-export it in your shell + re-configure the Render MCP header.

1. [Render → Account Settings → API Keys](https://dashboard.render.com/settings#api-keys) → **Create API key**
2. Copy the new one (starts `rnd_…`). Label it with the date.
3. Update your shell:
   ```bash
   # remove the old line from ~/.zshrc, then
   echo 'export RENDER_API_KEY=rnd_NEW_KEY' >> ~/.zshrc
   source ~/.zshrc
   render whoami   # verify it works
   ```
4. Update the Render MCP — the Bearer header is set at install time. Remove the MCP and re-add it:
   ```bash
   claude mcp remove render
   claude mcp add --transport http render https://mcp.render.com/mcp \
     --header "Authorization: Bearer rnd_NEW_KEY"
   ```
   Restart Claude Code to pick up the new MCP config.
5. **Revoke the old key** on the same Render settings page. Any other machine/agent still using it loses access immediately.

## §6. Post-rotation checklist

After each rotation:

- [ ] `render services --output json --confirm | grep name` — CLI still works
- [ ] Prod `/api/health` returns 200 — server started with new env
- [ ] `/admin/login` — you can still get a magic link and sign in
- [ ] Wallet panel — identity key matches what you expect
- [ ] Trigger one test registration — confirmation email arrives, txid is real (not `stub-`)
- [ ] `git log --oneline -10` — only intended commits, no secret leaks

## §7. When the whole project is handed off

Do §1 (Supabase), §3 (BOTH dev and prod WIFs, generating fresh ones for the new owner), §4 (Resend), and §5 (Render). Hand over:

- The new keys via a secure channel (1Password shared vault, encrypted file, in-person)
- This `ROTATE.md` file so the new owner knows the topology
- `CLAUDE.md` so they can orient on the codebase
