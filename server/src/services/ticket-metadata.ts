import { Utils } from "@bsv/sdk";

/**
 * Signed metadata payload that travels in the OP_RETURN output of every
 * ticket-ord transaction. Mirrors APH's `CertificateMetadataV2` shape but
 * specialised for BE-on-BSV registrations.
 *
 * The signature is over the canonical-JSON bytes of the payload *without*
 * the `signature` field. Verifiers can recover the unsigned form by
 * stripping that key and re-canonicalising.
 */
export const TICKET_SCHEMA_ID = "be-on-bsv-ticket/v1" as const;
export const TICKET_PROTOCOL_ID: [0, string] = [0, "be-on-bsv ticket"];
export const TICKET_KEY_ID = "1";

export interface UnsignedTicketMetadata {
  v: 1;
  schema: typeof TICKET_SCHEMA_ID;
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  issuedAt: string;
  /** SHA-256 of the inscribed SVG bytes (lowercase hex). */
  imageSha256: string;
  /** Identity key of the issuer (server wallet). */
  issuerIdentityKey: string;
  /** Per-protocol/key signing pubkey, counterparty `anyone`. */
  issuerPubKey: string;
}

export interface SignedTicketMetadata extends UnsignedTicketMetadata {
  /** Hex signature over `canonicalJson(unsigned)`. */
  signature: string;
}

/**
 * Stable serialization for signing. Sorts object keys recursively so the
 * exact byte layout is reproducible. Adapted from APH's `canonicalJson`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

interface WalletClientForSigning {
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
}

export interface BuildSignedMetadataInput {
  client: WalletClientForSigning;
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  issuedAt: string;
  imageSha256: string;
}

/**
 * Build and sign the ticket metadata. The signature is produced by the
 * server wallet using BRC-43 protocol/key derivation so verifiers can
 * recover the public key from the protocol+key+counterparty triplet
 * even if the server's identity key changes.
 */
export async function buildSignedTicketMetadata(
  input: BuildSignedMetadataInput,
): Promise<SignedTicketMetadata> {
  const { publicKey: issuerIdentityKey } = await input.client.getPublicKey({
    identityKey: true,
  });
  const { publicKey: issuerPubKey } = await input.client.getPublicKey({
    protocolID: TICKET_PROTOCOL_ID,
    keyID: TICKET_KEY_ID,
    counterparty: "anyone",
  });

  const unsigned: UnsignedTicketMetadata = {
    v: 1,
    schema: TICKET_SCHEMA_ID,
    eventId: input.eventId,
    registrationId: input.registrationId,
    eventTitle: input.eventTitle,
    name: input.name,
    issuedAt: input.issuedAt,
    imageSha256: input.imageSha256,
    issuerIdentityKey,
    issuerPubKey,
  };

  const sigResult = await input.client.createSignature({
    data: Utils.toArray(canonicalJson(unsigned), "utf8"),
    protocolID: TICKET_PROTOCOL_ID,
    keyID: TICKET_KEY_ID,
    counterparty: "anyone",
  });

  return { ...unsigned, signature: Utils.toHex(sigResult.signature) };
}
