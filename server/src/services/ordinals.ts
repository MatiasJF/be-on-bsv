import { createHash } from "node:crypto";
import { LockingScript, P2PKH, PublicKey, Utils } from "@bsv/sdk";
import { env } from "../env.js";
import { buildSignedTicketMetadata } from "./ticket-metadata.js";

/**
 * 1sat-ordinal mint for BE-on-BSV registrations.
 *
 * The transaction has two outputs:
 *   0: 1 sat — P2PKH locked to the server identity key, prefixed with the
 *      standard `OP_FALSE OP_IF "ord" OP_1 <content-type> OP_FALSE <bytes>
 *      OP_ENDIF` envelope. The bytes are the rendered ticket SVG.
 *   1: 0 sat — OP_RETURN carrying the signed metadata JSON. Indexers and
 *      verifiers can fetch it without parsing the inscription.
 *
 * The inscription envelope layout is identical to APH's certificate-poc
 * `inscription.ts` so the same off-chain verifiers work for both projects.
 */

const OP_FALSE = 0x00;
const OP_IF = 0x63;
const OP_ENDIF = 0x68;
const OP_1 = 0x51;
const OP_RETURN = 0x6a;

export interface MintOrdInput {
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  issuedAt: string;
  /** Rendered ticket SVG bytes that get inscribed. */
  svgBytes: Uint8Array;
}

export interface MintOrdResult {
  ord_txid: string;
  ord_outpoint: string;
  ord_metadata_sha256: string;
  stub: boolean;
}

interface WalletClient {
  getPublicKey: (req: {
    identityKey?: boolean;
    protocolID?: [0, string];
    keyID?: string;
    counterparty?: string;
  }) => Promise<{ publicKey: string }>;
  createSignature: (req: {
    data: number[];
    protocolID: [0, string];
    keyID: string;
    counterparty: string;
  }) => Promise<{ signature: number[] }>;
  createAction: (args: {
    description: string;
    outputs: Array<{
      satoshis: number;
      lockingScript: string;
      outputDescription: string;
      basket?: string;
      customInstructions?: string;
    }>;
    labels?: string[];
    options?: { acceptDelayedBroadcast?: boolean };
  }) => Promise<{ txid?: string }>;
}

interface ServerWalletLike {
  getClient: () => WalletClient;
}

function buildImageInscriptionScript(
  address: string,
  contentType: string,
  imageBytes: Uint8Array,
): LockingScript {
  const p2pkh = new P2PKH().lock(address);
  const script = new LockingScript([...p2pkh.chunks]);
  script.writeOpCode(OP_FALSE);
  script.writeOpCode(OP_IF);
  script.writeBin(Utils.toArray("ord", "utf8"));
  script.writeOpCode(OP_1);
  script.writeBin(Utils.toArray(contentType, "utf8"));
  script.writeOpCode(OP_FALSE);
  script.writeBin(Array.from(imageBytes));
  script.writeOpCode(OP_ENDIF);
  return script;
}

function buildOpReturnScript(payload: string): LockingScript {
  const script = new LockingScript();
  script.writeOpCode(OP_FALSE);
  script.writeOpCode(OP_RETURN);
  script.writeBin(Utils.toArray(payload, "utf8"));
  return script;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Mint a 1sat ordinal carrying the rendered ticket SVG plus signed metadata.
 *
 * Returns a deterministic stub when `BSV_ENABLED=false` so the registration
 * flow can still complete locally. The route handler wraps this — failures
 * are isolated and don't roll back the registration row.
 */
export async function mintTicketOrdinal(
  input: MintOrdInput,
  walletProvider: () => Promise<ServerWalletLike>,
): Promise<MintOrdResult> {
  if (!env.BSV_ENABLED) {
    return makeStub(input);
  }

  const wallet = await walletProvider();
  const client = wallet.getClient();

  const { publicKey: identityKey } = await client.getPublicKey({ identityKey: true });
  const address = PublicKey.fromString(identityKey).toAddress();

  const contentType = "image/svg+xml";
  const imageSha256 = sha256Hex(input.svgBytes);

  const metadata = await buildSignedTicketMetadata({
    client,
    eventId: input.eventId,
    registrationId: input.registrationId,
    eventTitle: input.eventTitle,
    name: input.name,
    issuedAt: input.issuedAt,
    imageSha256,
  });
  const metadataJson = JSON.stringify(metadata);
  const metadataSha256 = sha256Hex(new TextEncoder().encode(metadataJson));

  const imageScript = buildImageInscriptionScript(address, contentType, input.svgBytes);
  const opReturnScript = buildOpReturnScript(metadataJson);

  const result = await client.createAction({
    description: `BE-on-BSV ticket ord: ${truncate(input.name, 60)}`.slice(0, 128),
    outputs: [
      {
        satoshis: 1,
        lockingScript: imageScript.toHex(),
        outputDescription: "BE-on-BSV ticket image",
        basket: env.BSV_ORD_BASKET,
        customInstructions: JSON.stringify({
          type: "ticket-image",
          schema: metadata.schema,
          eventId: input.eventId,
          registrationId: input.registrationId,
          contentType,
          imageSha256,
        }),
      },
      {
        satoshis: 0,
        lockingScript: opReturnScript.toHex(),
        outputDescription: "BE-on-BSV ticket metadata",
      },
    ],
    labels: ["be-on-bsv", "ticket-ord", `event:${input.eventId}`],
    options: { acceptDelayedBroadcast: false },
  });

  if (!result.txid) {
    throw new Error("createAction returned no txid (mint may still be pending approval)");
  }

  return {
    ord_txid: result.txid,
    ord_outpoint: `${result.txid}.0`,
    ord_metadata_sha256: metadataSha256,
    stub: false,
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function makeStub(input: MintOrdInput): MintOrdResult {
  const hash = createHash("sha256")
    .update(`${input.eventId}|${input.registrationId}|ord-stub`)
    .digest("hex");
  return {
    ord_txid: `stub-ord-${hash.slice(0, 52)}`,
    ord_outpoint: `stub-ord-${hash.slice(0, 52)}.0`,
    ord_metadata_sha256: hash,
    stub: true,
  };
}
