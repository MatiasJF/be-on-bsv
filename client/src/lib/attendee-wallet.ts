import { useCallback, useState } from "react";

/**
 * Lightweight wallet integration for the public confirmation page.
 *
 * Mirrors `lib/wallet.ts`'s admin hook but with a smaller surface area —
 * attendees only need to connect, sign one challenge, and receive a cert.
 * The BRC-100 wallet bundle is lazy-imported so the public homepage build
 * stays small; the chunk only loads when the user clicks "Connect".
 *
 * Pattern lifted from APH/certificate-poc/certificate-kit/signed-fetch.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AttendeeWallet = any;

interface ConnectState {
  wallet: AttendeeWallet | null;
  identityKey: string | null;
  loading: boolean;
  error: string | null;
}

const PROTOCOL_ID: [0, string] = [0, "be on bsv attendee"];
const KEY_ID = "1";

export function useAttendeeWallet() {
  const [state, setState] = useState<ConnectState>({
    wallet: null,
    identityKey: null,
    loading: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@bsv/simple/browser");
      const createWallet = mod.createWallet ?? mod.default?.createWallet;
      if (typeof createWallet !== "function") {
        throw new Error("@bsv/simple/browser did not export createWallet");
      }
      // The BrowserWallet returned by createWallet() extends WalletCore.
      // Identity key is exposed synchronously via `getIdentityKey()`.
      // BRC-100 calls (createSignature, getPublicKey for derived keys) live
      // on the underlying client returned by `wallet.getClient()`.
      const wallet = await createWallet();
      const identityKey =
        typeof wallet.getIdentityKey === "function"
          ? String(wallet.getIdentityKey())
          : null;
      if (!identityKey) {
        throw new Error("wallet did not expose getIdentityKey()");
      }
      setState({ wallet, identityKey, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "wallet connection failed";
      // Stale dynamic-import error: the browser cached an `index.html` that
      // references a chunk hash from a previous deploy and that chunk is
      // gone. Reload the page to pick up the current entry point.
      const stale = /failed to fetch dynamically imported module|importing.*chunk|loading chunk/i.test(
        msg,
      );
      if (stale) {
        setState({
          wallet: null,
          identityKey: null,
          loading: false,
          error:
            "This page is out of date — the site was updated since you opened it. Reload to continue.",
        });
        return;
      }
      const friendly = /not\s*found|no wallet|undefined|window/i.test(msg)
        ? "No BSV browser wallet detected. Install MetaNet Desktop and reload this page."
        : msg;
      setState({ wallet: null, identityKey: null, loading: false, error: friendly });
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ wallet: null, identityKey: null, loading: false, error: null });
  }, []);

  return { ...state, connect, disconnect };
}

/**
 * Stable serialization. Mirrors the server's `canonicalJson` so the byte
 * layout matches across both sides.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

function utf8ToBytes(s: string): number[] {
  const enc = new TextEncoder().encode(s);
  return Array.from(enc);
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign a cert-flow request (issue or claim) with the wallet's BRC-43
 * derived key. The server reconstructs the same canonical message and
 * verifies the signature against the claimed identity key.
 */
async function signWalletAction(input: {
  wallet: AttendeeWallet;
  path: string;
  nonce: string;
}): Promise<{ identityKey: string; signature: string }> {
  const message = canonicalJson({
    path: input.path,
    method: "POST",
    nonce: input.nonce,
    body: "",
  });

  // Identity key off the simple wrapper (sync); signing goes through the
  // underlying BRC-100 client. Both are stable surfaces of @bsv/simple's
  // BrowserWallet — the wrapper proxies `getIdentityKey()` itself but
  // delegates BRC-100 method calls (createSignature, getPublicKey for
  // derived keys, …) to the inner WalletInterface.
  const identityKey = String(input.wallet.getIdentityKey());
  const client = input.wallet.getClient();
  const sig = await client.createSignature({
    data: utf8ToBytes(message),
    protocolID: PROTOCOL_ID,
    keyID: KEY_ID,
    counterparty: "anyone",
  });

  return {
    identityKey,
    signature: bytesToHex(sig.signature as number[]),
  };
}

export function signIssueCertChallenge(input: {
  wallet: AttendeeWallet;
  registrationId: string;
  nonce: string;
}): Promise<{ identityKey: string; signature: string }> {
  return signWalletAction({
    wallet: input.wallet,
    path: `/api/register/${input.registrationId}/issue-cert`,
    nonce: input.nonce,
  });
}

export function signClaimRewardChallenge(input: {
  wallet: AttendeeWallet;
  registrationId: string;
  nonce: string;
}): Promise<{ identityKey: string; signature: string }> {
  return signWalletAction({
    wallet: input.wallet,
    path: `/api/register/${input.registrationId}/claim-reward`,
    nonce: input.nonce,
  });
}

/** Marketing URL for users who don't have a BSV wallet yet. */
export const METANET_DESKTOP_INSTALL_URL =
  "https://hub.bsvblockchain.org/demos-and-onboardings/onboardings/onboarding-catalog/metanet-desktop-mainnet";
