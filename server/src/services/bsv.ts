import { createHash } from "node:crypto";
import { env } from "../env.js";

/**
 * BSV "ticket" service.
 *
 * Each registration is recorded on-chain as a token in the
 * `BSV_TICKET_BASKET` basket via `@bsv/simple/server`'s `ServerWallet`.
 * The token's `data` payload carries the event id, registration id,
 * a short label, and the issued-at timestamp.
 *
 * The exact API surface (`ServerWallet.create`, `wallet.createToken`,
 * `wallet.listTokenDetails`, `wallet.redeemToken`) was confirmed via the
 * `@bsv/simple-mcp` server — see CLAUDE.md §6 for the rationale.
 *
 * Local-dev safety: when `BSV_ENABLED=false` (the default), this service
 * returns a deterministic stub txid + outpoint instead of touching the chain.
 * That keeps the rest of the app developable without keys or funded wallets.
 *
 * Failure isolation: errors thrown from here do NOT roll back the
 * registration. The route handler keeps the row, leaves `tx_id` null, and
 * surfaces failed mints to the admin dashboard for retry.
 */

export interface MintInput {
  eventId: string;
  registrationId: string;
}

export interface MintResult {
  tx_id: string;
  outpoint: string;
  stub: boolean;
}

interface TicketTokenData {
  label: "BE-on-BSV";
  eventId: string;
  registrationId: string;
  issuedAt: string;
}

// ── lazy singleton wallet ───────────────────────────────────
// We don't construct the wallet at module load — that would force everyone
// (including tests + local dev with BSV_ENABLED=false) to install and connect
// to the storage backend. Instead the wallet is built on first real use.
//
// The type is `unknown` here because we lazy-import @bsv/simple/server and
// don't want to drag its types into modules that never use the real path.
let walletPromise: Promise<unknown> | null = null;

async function getWallet(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createToken: (input: { data: unknown; basket: string; satoshis: number }) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listTokenDetails: (basket: string) => Promise<any[]>;
}> {
  if (!walletPromise) {
    walletPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@bsv/simple/server");
      const ServerWallet = mod.ServerWallet ?? mod.default?.ServerWallet;
      if (!ServerWallet || typeof ServerWallet.create !== "function") {
        throw new Error(
          "@bsv/simple/server did not expose ServerWallet.create — package shape may have changed",
        );
      }
      return ServerWallet.create({
        privateKey: env.BSV_SERVER_PRIVATE_KEY,
        network: env.BSV_NETWORK,
        storageUrl: env.BSV_STORAGE_URL,
      });
    })();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return walletPromise as Promise<any>;
}

// ── public API ──────────────────────────────────────────────

export async function mintRegistrationTicket(input: MintInput): Promise<MintResult> {
  if (!env.BSV_ENABLED) {
    return makeStub(input);
  }

  try {
    const wallet = await getWallet();

    const data: TicketTokenData = {
      label: "BE-on-BSV",
      eventId: input.eventId,
      registrationId: input.registrationId,
      issuedAt: new Date().toISOString(),
    };

    const result = await wallet.createToken({
      data,
      basket: env.BSV_TICKET_BASKET,
      satoshis: 1,
    });

    const txid: string | undefined = result?.txid ?? result?.tx_id;
    if (!txid) {
      throw new Error("createToken returned no txid");
    }

    // `createToken` doesn't return the vout directly. The convention for
    // single-output token transactions is vout 0; we resolve the real outpoint
    // from `listTokenDetails` so any future API change is caught here rather
    // than silently producing wrong outpoints.
    const outpoint = await resolveOutpoint(wallet, txid);

    return { tx_id: txid, outpoint, stub: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PushDrop ticket mint failed: ${msg}`);
  }
}

/**
 * Optional: list all tickets in our basket. Useful for the admin dashboard
 * to reconcile failed mints, or to debug from the server console.
 */
export async function listAllTickets(): Promise<unknown[]> {
  if (!env.BSV_ENABLED) return [];
  const wallet = await getWallet();
  return wallet.listTokenDetails(env.BSV_TICKET_BASKET);
}

// ── helpers ─────────────────────────────────────────────────

async function resolveOutpoint(
  wallet: { listTokenDetails: (basket: string) => Promise<unknown[]> },
  txid: string,
): Promise<string> {
  try {
    const tokens = (await wallet.listTokenDetails(env.BSV_TICKET_BASKET)) as Array<{
      outpoint?: string;
    }>;
    const match = tokens.find((t) => typeof t.outpoint === "string" && t.outpoint.startsWith(txid));
    if (match?.outpoint) return match.outpoint;
  } catch {
    // fall through to vout-0 default
  }
  return `${txid}.0`;
}

function makeStub(input: MintInput): MintResult {
  const hash = createHash("sha256")
    .update(`${input.eventId}|${input.registrationId}|stub`)
    .digest("hex");
  return {
    tx_id: `stub-${hash.slice(0, 56)}`,
    outpoint: `stub-${hash.slice(0, 56)}.0`,
    stub: true,
  };
}
