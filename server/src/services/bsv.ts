import { createHash } from "node:crypto";
import { env } from "../env.js";

/**
 * Mints a PushDrop "ticket" for a registration.
 *
 * When `BSV_ENABLED=true` and a server private key is configured, this calls
 * `@bsv/simple/server` to mint a real on-chain PushDrop containing the event id,
 * registration id, and an `BE-on-BSV` label.
 *
 * When disabled (the default for local dev), it returns a deterministic stub
 * txid + outpoint derived from the input. This lets the rest of the app develop
 * normally without funded keys, and the admin dashboard can distinguish stubs
 * from real tickets via the `stub` flag.
 *
 * Failures are caller-handled: a thrown error here means the registration row
 * is still inserted (see registrations route) but the ticket fields are left
 * null and the admin can retry later.
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

export async function mintRegistrationTicket(input: MintInput): Promise<MintResult> {
  if (!env.BSV_ENABLED) {
    return makeStub(input);
  }

  // Real path. Lazy-import so dev environments without the package installed
  // (or without a wallet) can still run.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("@bsv/simple/server");
    const { createWallet } = mod;

    const wallet = await createWallet({
      privateKey: env.BSV_SERVER_PRIVATE_KEY,
    });

    // PushDrop payload — keep it small. Each field becomes a push.
    const payload = [
      "BE-on-BSV",
      input.eventId,
      input.registrationId,
      new Date().toISOString(),
    ];

    // The `@bsv/simple` API for PushDrop varies by version; the high-level
    // `createPushDrop` is what we want. If the API surface changes, this is
    // the only place that needs to update.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await wallet.createPushDrop({
      data: payload,
      satoshis: 1,
    });

    const txid: string = result.txid ?? result.tx_id;
    const vout: number = result.vout ?? 0;

    if (!txid) {
      throw new Error("PushDrop mint returned no txid");
    }

    return {
      tx_id: txid,
      outpoint: `${txid}.${vout}`,
      stub: false,
    };
  } catch (err) {
    // Re-throw with context. The caller decides what to do.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PushDrop ticket mint failed: ${msg}`);
  }
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
