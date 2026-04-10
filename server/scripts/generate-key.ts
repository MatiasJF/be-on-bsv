/**
 * One-shot helper to generate a fresh BSV server wallet private key.
 *
 * Usage:
 *   npm --workspace server run bsv:generate-key
 *
 * Prints a WIF private key to stdout. Copy it into `.env` as
 * BSV_SERVER_PRIVATE_KEY, set BSV_ENABLED=true, and restart the dev server.
 *
 * IMPORTANT: This key controls funds once the server wallet is funded.
 * Treat it as a secret. Don't paste it in chat, screenshots, or commits.
 */
import { generatePrivateKey } from "@bsv/simple/server";

const key = generatePrivateKey();

// eslint-disable-next-line no-console
console.log(`
─────────────────────────────────────────────────────────────
BE on BSV — server wallet private key (fresh)
─────────────────────────────────────────────────────────────

  ${key}

To activate:

  1. Open .env at the repo root
  2. Set:
       BSV_SERVER_PRIVATE_KEY=${key}
       BSV_ENABLED=true
  3. Restart the dev server (Ctrl+C then \`npm run dev\`)
  4. Open the admin dashboard → "Server wallet" panel
  5. Connect your browser wallet and fund the server wallet
     with a small amount (a few thousand sats is enough)

⚠ Treat this key as a secret. Anyone with it can spend the
  server wallet's funds.
─────────────────────────────────────────────────────────────
`);
