import { createHash, randomUUID } from "node:crypto";
import { ProtoWallet, Utils } from "@bsv/sdk";
import { env } from "../env.js";

/**
 * Attendee certificate — server-issued credential proving a wallet identity
 * key registered for an event. Issued after the user connects MetaNet
 * Desktop (or any BRC-100 wallet) on the public confirmation page.
 *
 * The cert is a signed JSON payload, not an on-chain inscription. The DB
 * stores the issuer-relevant fields (`attendee_identity_key`, `cert_serial`,
 * `cert_issued_at`) so the reward-claim path can re-verify identity later.
 *
 * BRC-43 is used for both the wallet-side challenge signing (proves the
 * caller controls the claimed identity key) and the server-side cert
 * signature (so verifiers recover the issuer's pubkey from
 * protocol+key+counterparty without needing the bare key).
 *
 * Lifted from APH/certificate-poc/certificate-kit/signed-fetch.ts.
 */

export const ATTENDEE_CERT_SCHEMA_ID = "be-on-bsv-attendee/v1" as const;
export const ATTENDEE_CERT_PROTOCOL_ID: [0, string] = [0, "be on bsv attendee"];
export const ATTENDEE_CERT_KEY_ID = "1";

export interface AttendeeCertPayload {
  v: 1;
  schema: typeof ATTENDEE_CERT_SCHEMA_ID;
  eventId: string;
  registrationId: string;
  eventTitle: string;
  /** Display name from the registration. */
  name: string;
  /** SHA-256 of the lowercased email — proves binding without leaking PII. */
  emailHash: string;
  /** Hex-encoded wallet pubkey the cert is bound to. */
  attendeeIdentityKey: string;
  /** Hex-encoded server identity key (issuer). */
  issuerIdentityKey: string;
  /** ISO-8601 timestamp. */
  issuedAt: string;
  /** Random uuid; used as the revocation handle in DB. */
  serial: string;
}

export interface AttendeeCert extends AttendeeCertPayload {
  /** Hex DER signature over canonicalJson(payload-without-signature). */
  signature: string;
}

/**
 * Stable serialization for signing. Sorts object keys recursively. Lifts
 * APH's `canonicalJson` from `certificate-kit/schema.ts`.
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

export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

interface WalletForCertSigning {
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

export interface IssueCertInput {
  wallet: WalletForCertSigning;
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  email: string;
  attendeeIdentityKey: string;
}

/**
 * Build and sign an attendee cert. The signature uses BRC-43 protocol/key
 * derivation so verifiers recover the signing pubkey from
 * `protocolID + keyID + counterparty="anyone"` rather than needing the
 * raw key. Same pattern as the ord ticket's signed metadata.
 */
export async function issueAttendeeCert(input: IssueCertInput): Promise<AttendeeCert> {
  const { publicKey: issuerIdentityKey } = await input.wallet.getPublicKey({
    identityKey: true,
  });

  const payload: AttendeeCertPayload = {
    v: 1,
    schema: ATTENDEE_CERT_SCHEMA_ID,
    eventId: input.eventId,
    registrationId: input.registrationId,
    eventTitle: input.eventTitle,
    name: input.name,
    emailHash: emailHash(input.email),
    attendeeIdentityKey: input.attendeeIdentityKey,
    issuerIdentityKey,
    issuedAt: new Date().toISOString(),
    serial: randomUUID(),
  };

  const sigResult = await input.wallet.createSignature({
    data: Utils.toArray(canonicalJson(payload), "utf8"),
    protocolID: ATTENDEE_CERT_PROTOCOL_ID,
    keyID: ATTENDEE_CERT_KEY_ID,
    counterparty: "anyone",
  });

  return { ...payload, signature: Utils.toHex(sigResult.signature) };
}

/**
 * Verify a wallet-signed message against a claimed identity key.
 * Used to check the challenge response in `/issue-cert` + `/claim-reward`.
 *
 * The wallet signs the canonical-JSON of `{ path, method, nonce, body }`
 * via `client.createSignature({ protocolID, keyID, counterparty: "anyone" })`,
 * which produces a signature with a key DERIVED from the identity key
 * (not the identity key itself).
 *
 * The symmetric verifier is `ProtoWallet("anyone").verifySignature(...)`
 * with `counterparty` set to the SIGNER's identity key — that re-derives
 * the same expected pubkey on the verifier side and checks the signature
 * against it. This is the BRC-43 verify path; we previously used a raw
 * `PublicKey.verify` against the identity key, which always failed because
 * the signing key was the derived one, not the identity key.
 */
export const SIGNED_FETCH_PROTOCOL_ID: [0, string] = [0, "be on bsv attendee"];
export const SIGNED_FETCH_KEY_ID = "1";

export interface VerifySignedFetchInput {
  /** Hex-encoded identity pubkey returned by `wallet.getIdentityKey()`. */
  identityKey: string;
  /** Hex-encoded DER signature from `client.createSignature`. */
  signatureHex: string;
  /** Canonical message that was signed. */
  message: string;
}

// Module-level singleton so we don't construct a new ProtoWallet per request.
const verifierWallet = new ProtoWallet("anyone");

export async function verifyWalletSignature(
  input: VerifySignedFetchInput,
): Promise<boolean> {
  try {
    const result = await verifierWallet.verifySignature({
      data: Utils.toArray(input.message, "utf8"),
      signature: Utils.toArray(input.signatureHex, "hex"),
      protocolID: SIGNED_FETCH_PROTOCOL_ID,
      keyID: SIGNED_FETCH_KEY_ID,
      counterparty: input.identityKey,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

/**
 * Reconstruct the message that the browser signed, given path/method/body/nonce.
 * Mirrors APH's `walletSignedFetch` exactly so the byte layout matches.
 */
export function buildSignedFetchMessage(input: {
  path: string;
  method: string;
  nonce: string;
  body: string;
}): string {
  return canonicalJson({
    path: input.path,
    method: input.method.toUpperCase(),
    nonce: input.nonce,
    body: input.body,
  });
}

/**
 * Sanity-check the request is for the right schema and registration.
 */
export function isValidCertForRegistration(
  cert: AttendeeCert,
  registrationId: string,
  eventId: string,
): boolean {
  return (
    cert.schema === ATTENDEE_CERT_SCHEMA_ID &&
    cert.registrationId === registrationId &&
    cert.eventId === eventId
  );
}

/** Read REWARD_SATS at call site to honor live env changes during dev. */
export function rewardSats(): number {
  return env.REWARD_SATS;
}
