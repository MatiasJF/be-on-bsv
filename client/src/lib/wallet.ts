import { useCallback, useEffect, useState } from "react";

/**
 * Browser-wallet integration for the admin dashboard.
 *
 * Lazy-imports `@bsv/simple/browser` so the public bundle (which most
 * visitors hit) doesn't pay the cost — the BSV client is only loaded
 * the first time an admin opens the wallet panel.
 *
 * Pattern aligned with the canonical hook from `@bsv/simple-mcp`'s
 * `generate_wallet_setup` (target: browser, framework: react).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrowserWallet = any;

interface UseWalletState {
  wallet: BrowserWallet | null;
  identityKey: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Connect to whatever browser wallet the user has installed
 * (Babbage MetaNet Desktop, Yours, etc.) via @bsv/simple/browser.
 *
 * Returns a small API: { wallet, identityKey, loading, error, connect }.
 */
export function useWallet() {
  const [state, setState] = useState<UseWalletState>({
    wallet: null,
    identityKey: null,
    loading: false,
    error: null,
  });

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // Lazy import — keeps the BSV bundle out of the public homepage build.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@bsv/simple/browser");
      const createWallet = mod.createWallet ?? mod.default?.createWallet;
      if (typeof createWallet !== "function") {
        throw new Error("@bsv/simple/browser did not export createWallet");
      }
      const w = await createWallet();
      const identityKey =
        typeof w?.getIdentityKey === "function" ? String(w.getIdentityKey()) : null;
      setState({ wallet: w, identityKey, loading: false, error: null });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "wallet connection failed";
      // The most common cause is "no browser wallet installed". Translate.
      const friendly = /not\s*found|no wallet|undefined/i.test(msg)
        ? "No BSV browser wallet detected. Install Babbage MetaNet Desktop (https://projectbabbage.com/desktop) or another @bsv/simple-compatible wallet, then retry."
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
 * Drive the BRC-29 funding flow against the server wallet, end-to-end.
 *
 * 1. Ask the server for a payment request (carries server identity key
 *    + derivation prefix/suffix).
 * 2. Have the browser wallet construct + sign the funding tx via
 *    `wallet.fundServerWallet(request, basket)`.
 * 3. POST the tx bytes back to the server so it can `receiveDirectPayment`.
 *
 * Returns the txid on success. Throws with a useful message on any failure.
 */
export async function fundServerWallet(input: {
  wallet: BrowserWallet;
  satoshis: number;
  basket: string;
  memo?: string;
  /** Bearer token for the admin API. */
  authToken: string;
}): Promise<{ txid: string }> {
  // Step 1 — request
  const params = new URLSearchParams({ satoshis: String(input.satoshis) });
  if (input.memo) params.set("memo", input.memo);
  const reqRes = await fetch(`/api/admin/wallet/funding-request?${params.toString()}`, {
    headers: { Authorization: `Bearer ${input.authToken}` },
  });
  if (!reqRes.ok) {
    const body = await safeJson(reqRes);
    throw new Error(`payment request failed: ${body?.error ?? reqRes.statusText}`);
  }
  const { paymentRequest } = (await reqRes.json()) as {
    paymentRequest: {
      serverIdentityKey: string;
      derivationPrefix: string;
      derivationSuffix: string;
      satoshis: number;
      memo?: string;
    };
  };

  // Step 2 — browser wallet builds + signs the funding tx
  const result = await input.wallet.fundServerWallet(paymentRequest, input.basket);
  const txBytes: number[] = Array.from((result?.tx ?? new Uint8Array()) as Uint8Array);
  const txid: string | undefined = result?.txid ?? result?.tx_id;
  if (!txid || txBytes.length === 0) {
    throw new Error("browser wallet returned no signed transaction");
  }

  // Step 3 — server internalizes
  const recvRes = await fetch("/api/admin/wallet/funding-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.authToken}`,
    },
    body: JSON.stringify({
      tx: txBytes,
      senderIdentityKey:
        typeof input.wallet.getIdentityKey === "function" ? input.wallet.getIdentityKey() : "",
      derivationPrefix: paymentRequest.derivationPrefix,
      derivationSuffix: paymentRequest.derivationSuffix,
      outputIndex: 0,
      description: input.memo ?? "BE on BSV admin funding",
    }),
  });
  if (!recvRes.ok) {
    const body = await safeJson(recvRes);
    throw new Error(`server failed to receive payment: ${body?.error ?? recvRes.statusText}`);
  }

  return { txid };
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

/**
 * Format a satoshi count as a human-readable string with thousand separators.
 */
export function formatSats(sats: number | null | undefined): string {
  if (sats == null) return "—";
  return `${sats.toLocaleString("en-US")} sats`;
}

/**
 * Truncate a long hex identity key for display: "abc12345…789def".
 */
export function truncateKey(key: string | null | undefined, head = 8, tail = 6): string {
  if (!key) return "—";
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/**
 * Re-fetch the server wallet info from the admin API on mount and on demand.
 */
export interface ServerWalletInfo {
  enabled: boolean;
  identityKey: string | null;
  network: "main" | "test" | null;
  basket: string;
  totalSatoshis: number | null;
  utxoCount: number | null;
  status: string | null;
  error?: string;
}

export function useServerWalletInfo(authTokenGetter: () => Promise<string | null>) {
  const [info, setInfo] = useState<ServerWalletInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await authTokenGetter();
      if (!token) throw new Error("not signed in");
      const res = await fetch("/api/admin/wallet/info", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as { wallet: ServerWalletInfo };
      setInfo(data.wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load wallet info");
    } finally {
      setLoading(false);
    }
  }, [authTokenGetter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { info, loading, error, refresh };
}
