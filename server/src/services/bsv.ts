import { createHash } from "node:crypto";
import { env } from "../env.js";
import { mintTicketOrdinal, type MintOrdResult } from "./ordinals.js";
import { issueAttendeeCert, type AttendeeCert } from "./attendee-certs.js";

/**
 * BSV "ticket" service.
 *
 * Each registration is recorded on-chain as a token in the
 * `BSV_TICKET_BASKET` basket via `@bsv/simple/server`'s `ServerWallet`.
 * The token's `data` payload carries the event id, registration id,
 * a short label, and the issued-at timestamp.
 *
 * The exact API surface (`ServerWallet.create`, `wallet.createToken`,
 * `wallet.listTokenDetails`, `wallet.createPaymentRequest`,
 * `wallet.receiveDirectPayment`) was confirmed via the
 * `@bsv/simple-mcp` server and the package's own .d.ts files.
 * See CLAUDE.md §6 for the rationale.
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

export interface ServerWalletPaymentRequest {
  serverIdentityKey: string;
  derivationPrefix: string;
  derivationSuffix: string;
  satoshis: number;
  memo?: string;
}

export interface IncomingPaymentInput {
  tx: number[]; // serialized tx bytes (Array.from(uint8))
  senderIdentityKey: string;
  derivationPrefix: string;
  derivationSuffix: string;
  outputIndex: number;
  description?: string;
}

export interface ServerWalletInfo {
  enabled: boolean;
  identityKey: string | null;
  network: "main" | "test" | null;
  basket: string;
  totalSatoshis: number | null;
  utxoCount: number | null;
  status: string | null;
  /** True when spendable balance is below BSV_LOW_BALANCE_SATS. */
  lowBalance: boolean;
  /** The threshold used for `lowBalance`, for UI display. */
  lowBalanceThreshold: number;
  error?: string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let walletPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWallet(): Promise<any> {
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
  return walletPromise;
}

// ── public API: ticket minting ──────────────────────────────

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

    const outpoint = await resolveOutpoint(wallet, txid);

    return { tx_id: txid, outpoint, stub: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PushDrop ticket mint failed: ${msg}`);
  }
}

/**
 * Mint a 1sat ordinal carrying the rendered ticket SVG + signed metadata.
 *
 * Thin wrapper that supplies the cached server wallet to `ordinals.ts`.
 * Same failure-isolation contract as `mintRegistrationTicket`: the route
 * keeps the registration row even if this throws.
 */
export async function mintTicketOrd(input: {
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  issuedAt: string;
  svgBytes: Uint8Array;
}): Promise<MintOrdResult> {
  return mintTicketOrdinal(input, async () => {
    const wallet = await getWallet();
    return { getClient: () => wallet.getClient() };
  });
}

/**
 * Issue a signed attendee certificate using the server wallet's BRC-43
 * derived signing key. Wrapper that supplies the cached wallet's client
 * to `attendee-certs.ts` so the route layer doesn't need to know about
 * wallet construction.
 *
 * Throws when BSV mode is disabled — the cert needs the server's identity
 * key to sign, and the stub key wouldn't be cryptographically meaningful.
 * The route handler surfaces this as a 503 so the UI can prompt the user
 * to wait until the operator turns on real signing.
 */
export async function issueServerSignedAttendeeCert(input: {
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  email: string;
  attendeeIdentityKey: string;
}): Promise<AttendeeCert> {
  if (!env.BSV_ENABLED) {
    throw new Error("BSV is disabled — set BSV_ENABLED=true and restart to issue real certs");
  }
  const wallet = await getWallet();
  return issueAttendeeCert({
    wallet: wallet.getClient(),
    eventId: input.eventId,
    registrationId: input.registrationId,
    eventTitle: input.eventTitle,
    name: input.name,
    email: input.email,
    attendeeIdentityKey: input.attendeeIdentityKey,
  });
}

/**
 * List all tickets in our basket. Useful for the admin dashboard
 * to reconcile failed mints, or to debug from the server console.
 */
export async function listAllTickets(): Promise<unknown[]> {
  if (!env.BSV_ENABLED) return [];
  const wallet = await getWallet();
  return wallet.listTokenDetails(env.BSV_TICKET_BASKET);
}

// ── public API: server wallet info + funding ────────────────

/**
 * Read-only snapshot of the server wallet's state. Used by the admin
 * dashboard to show identity key, network, balance, and whether BSV mode
 * is currently enabled.
 *
 * Never throws — callers always get a `ServerWalletInfo` object so the
 * admin UI can render an informative state when BSV is disabled or the
 * wallet failed to construct.
 */
export async function getServerWalletInfo(): Promise<ServerWalletInfo> {
  if (!env.BSV_ENABLED) {
    return {
      enabled: false,
      identityKey: null,
      network: null,
      basket: env.BSV_TICKET_BASKET,
      totalSatoshis: null,
      utxoCount: null,
      status: "disabled",
      lowBalance: false,
      lowBalanceThreshold: env.BSV_LOW_BALANCE_SATS,
    };
  }

  try {
    const wallet = await getWallet();
    const identityKey: string =
      typeof wallet.getIdentityKey === "function" ? wallet.getIdentityKey() : "";

    // WalletStatus shape per types.d.ts: { isConnected, identityKey, network }
    let status = "ready";
    if (typeof wallet.getStatus === "function") {
      const s = wallet.getStatus();
      if (s && typeof s === "object" && "isConnected" in s) {
        status = s.isConnected ? "connected" : "disconnected";
      } else if (typeof s === "string") {
        status = s;
      }
    }

    // BalanceResult shape per types.d.ts:
    //   { totalSatoshis, totalOutputs, spendableSatoshis, spendableOutputs }
    // We surface SPENDABLE values — the ones that actually let us mint
    // tickets — under the existing field names so the UI doesn't lie about
    // what the wallet can do.
    let totalSatoshis: number | null = null;
    let utxoCount: number | null = null;
    try {
      const balance = await wallet.getBalance();
      totalSatoshis =
        typeof balance?.spendableSatoshis === "number"
          ? balance.spendableSatoshis
          : typeof balance?.totalSatoshis === "number"
            ? balance.totalSatoshis
            : null;
      utxoCount =
        typeof balance?.spendableOutputs === "number"
          ? balance.spendableOutputs
          : typeof balance?.totalOutputs === "number"
            ? balance.totalOutputs
            : null;
    } catch {
      // balance read is best-effort; not all storage backends support it
    }

    const lowBalance =
      totalSatoshis !== null && totalSatoshis < env.BSV_LOW_BALANCE_SATS;

    return {
      enabled: true,
      identityKey: identityKey || null,
      network: env.BSV_NETWORK,
      basket: env.BSV_TICKET_BASKET,
      totalSatoshis,
      utxoCount,
      status,
      lowBalance,
      lowBalanceThreshold: env.BSV_LOW_BALANCE_SATS,
    };
  } catch (err) {
    return {
      enabled: true,
      identityKey: null,
      network: env.BSV_NETWORK,
      basket: env.BSV_TICKET_BASKET,
      totalSatoshis: null,
      utxoCount: null,
      status: "error",
      lowBalance: false,
      lowBalanceThreshold: env.BSV_LOW_BALANCE_SATS,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Generate a BRC-29 payment request that the browser wallet will use to
 * fund the server wallet. The request contains the server's identity key
 * and the derivation prefix/suffix the sender must use.
 */
export async function createServerPaymentRequest(
  satoshis: number,
  memo?: string,
): Promise<ServerWalletPaymentRequest> {
  if (!env.BSV_ENABLED) {
    throw new Error("BSV is disabled — set BSV_ENABLED=true and restart to fund the server wallet");
  }
  const wallet = await getWallet();
  const req = await wallet.createPaymentRequest({ satoshis, memo });
  return {
    serverIdentityKey: String(req.serverIdentityKey),
    derivationPrefix: String(req.derivationPrefix),
    derivationSuffix: String(req.derivationSuffix),
    satoshis: Number(req.satoshis),
    memo: req.memo ?? undefined,
  };
}

/**
 * Internalize a payment that a browser wallet just constructed against the
 * payment request returned by `createServerPaymentRequest`. After this call
 * the server wallet has spendable UTXOs and can mint real tickets.
 */
export async function receiveServerPayment(payment: IncomingPaymentInput): Promise<void> {
  if (!env.BSV_ENABLED) {
    throw new Error("BSV is disabled — cannot receive payments");
  }
  const wallet = await getWallet();
  await wallet.receiveDirectPayment({
    tx: payment.tx,
    senderIdentityKey: payment.senderIdentityKey,
    derivationPrefix: payment.derivationPrefix,
    derivationSuffix: payment.derivationSuffix,
    outputIndex: payment.outputIndex,
    description: payment.description ?? "BE on BSV admin funding",
  });
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
