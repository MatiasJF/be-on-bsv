import { useState } from "react";
import { GlassCard } from "./GlassCard.js";
import { Button } from "./Button.js";
import {
  formatSats,
  fundServerWallet,
  truncateKey,
  useServerWalletInfo,
  useWallet,
} from "../lib/wallet.js";
import { getAccessToken } from "../lib/supabase.js";

/**
 * Admin-only panel for inspecting and funding the server wallet.
 *
 * Two halves:
 *
 *   ┌── Server wallet ─────────────┐
 *   │ status / identityKey / balance│  ← /api/admin/wallet/info
 *   └───────────────────────────────┘
 *
 *   ┌── Fund from your browser wallet ─┐
 *   │ [Connect wallet]                  │  ← @bsv/simple/browser
 *   │ amount input + [Send] button      │  ← BRC-29 funding flow
 *   └────────────────────────────────────┘
 */
export function WalletPanel() {
  const {
    info,
    pendingMintCount,
    pendingOrdCount,
    claimableRewardCount,
    loading: infoLoading,
    error: infoError,
    refresh,
  } = useServerWalletInfo(getAccessToken);
  const { wallet, identityKey, loading: walletLoading, error: walletError, connect } = useWallet();

  const [amount, setAmount] = useState<string>("5000");
  const [funding, setFunding] = useState(false);
  const [fundError, setFundError] = useState<string | null>(null);
  const [lastTxid, setLastTxid] = useState<string | null>(null);

  async function onFund(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || !info?.enabled) return;
    setFundError(null);
    setLastTxid(null);
    setFunding(true);
    try {
      const sats = Number(amount);
      if (!Number.isFinite(sats) || sats < 1) {
        throw new Error("amount must be a positive integer");
      }
      const token = await getAccessToken();
      if (!token) throw new Error("not signed in");
      const result = await fundServerWallet({
        wallet,
        satoshis: sats,
        basket: info.basket,
        memo: "BE on BSV — server wallet funding",
        authToken: token,
      });
      setLastTxid(result.txid);
      // Give the wallet-toolbox a moment, then re-pull balance.
      setTimeout(() => void refresh(), 1500);
    } catch (e) {
      setFundError(e instanceof Error ? e.message : "funding failed");
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6 mb-8">
      {/* ── Server wallet status ── */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-bsva-cyan text-xs font-display font-semibold uppercase tracking-wider mb-1">
              Server wallet
            </div>
            <div className="font-display font-semibold text-white text-xl">
              {info?.enabled ? "Live" : info ? "Stub mode" : "…"}
            </div>
          </div>
          <button
            onClick={() => void refresh()}
            className="text-xs text-white/50 hover:text-white font-body"
            title="Refresh"
          >
            ↻ refresh
          </button>
        </div>

        {infoError && <ErrorBanner>{infoError}</ErrorBanner>}

        {info && (
          <dl className="grid grid-cols-[120px_1fr] gap-y-2.5 text-sm font-body">
            <dt className="text-white/50">Status</dt>
            <dd className="text-white">{info.status ?? "—"}</dd>
            <dt className="text-white/50">Network</dt>
            <dd className="text-white">{info.network ?? "—"}</dd>
            <dt className="text-white/50">Basket</dt>
            <dd className="text-white font-mono text-xs">{info.basket}</dd>
            <dt className="text-white/50">Identity key</dt>
            <dd
              className="text-bsva-cyan font-mono text-xs break-all"
              title={info.identityKey ?? undefined}
            >
              {info.identityKey ? truncateKey(info.identityKey, 12, 8) : "—"}
            </dd>
            <dt className="text-white/50">Balance</dt>
            <dd className="text-white font-display font-semibold">
              {formatSats(info.totalSatoshis)}{" "}
              {typeof info.utxoCount === "number" && (
                <span className="text-white/50 font-body font-normal text-xs">
                  ({info.utxoCount} utxos)
                </span>
              )}
            </dd>
          </dl>
        )}

        {info?.enabled && info.lowBalance && (
          <div className="mt-5 rounded-lg border border-yellow-400/40 bg-yellow-400/[0.08] p-3 text-sm font-body">
            <div className="text-yellow-200 font-display font-semibold mb-1">
              ⚠ Low balance
            </div>
            <div className="text-white/70 leading-snug">
              Spendable balance is below {formatSats(info.lowBalanceThreshold)}. Top up
              from the panel on the right to keep minting tickets.
            </div>
          </div>
        )}

        {pendingMintCount > 0 && (
          <div className="mt-3 rounded-lg border border-bsva-cyan/30 bg-bsva-cyan/[0.06] p-3 text-sm font-body">
            <div className="text-bsva-cyan font-display font-semibold mb-1">
              {pendingMintCount} registration{pendingMintCount === 1 ? "" : "s"} pending mint
            </div>
            <div className="text-white/70 leading-snug">
              These registrations never got an on-chain ticket. Open the event's registrations
              list from the dashboard to retry minting.
            </div>
          </div>
        )}

        {pendingOrdCount > 0 && (
          <div className="mt-3 rounded-lg border border-bsva-cyan/30 bg-bsva-cyan/[0.06] p-3 text-sm font-body">
            <div className="text-bsva-cyan font-display font-semibold mb-1">
              {pendingOrdCount} registration{pendingOrdCount === 1 ? "" : "s"} pending ord
            </div>
            <div className="text-white/70 leading-snug">
              These registrations are missing the inscribed-SVG ord. Use{" "}
              <span className="text-bsva-cyan">Retry ord</span> on each row from the event's
              registrations list.
            </div>
          </div>
        )}

        {claimableRewardCount > 0 && (
          <div className="mt-3 rounded-lg border border-yellow-300/30 bg-yellow-300/[0.06] p-3 text-sm font-body">
            <div className="text-yellow-200 font-display font-semibold mb-1">
              {claimableRewardCount} reward{claimableRewardCount === 1 ? "" : "s"} not yet claimed
            </div>
            <div className="text-white/70 leading-snug">
              Cert holders haven't claimed their post-event sats yet. Each claim
              spends from the server wallet — make sure the balance covers
              outstanding rewards before they pile up.
            </div>
          </div>
        )}

        {info && !info.enabled && (
          <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70 font-body">
            <div className="text-white font-display font-semibold mb-1">
              BSV mode is currently disabled.
            </div>
            Every registration receives a deterministic <span className="text-bsva-cyan font-mono">stub-…</span> txid instead of a real on-chain ticket.
            <div className="mt-3">To switch to live mode:</div>
            <ol className="list-decimal pl-5 mt-1 space-y-1 text-white/60">
              <li>
                Generate a wallet key:{" "}
                <code className="text-bsva-cyan">npm --workspace server run bsv:generate-key</code>
              </li>
              <li>
                Paste the WIF into <code className="text-bsva-cyan">.env</code> as{" "}
                <code className="text-bsva-cyan">BSV_SERVER_PRIVATE_KEY</code>
              </li>
              <li>
                Set <code className="text-bsva-cyan">BSV_ENABLED=true</code>
              </li>
              <li>Restart the dev server</li>
              <li>Reload this page and fund the wallet from the panel on the right ↪</li>
            </ol>
          </div>
        )}

        {infoLoading && !info && (
          <div className="text-white/50 font-body text-sm">Loading…</div>
        )}
      </GlassCard>

      {/* ── Fund from browser wallet ── */}
      <GlassCard className="p-6">
        <div className="text-bsva-cyan text-xs font-display font-semibold uppercase tracking-wider mb-1">
          Fund from your browser wallet
        </div>
        <div className="font-display font-semibold text-white text-xl mb-4">BRC-29 transfer</div>

        {!wallet ? (
          <>
            <p className="text-sm text-white/60 font-body mb-4 leading-relaxed">
              Connect a BSV browser wallet to send sats to the server wallet's identity key. The
              server wallet then has the UTXOs it needs to mint real on-chain tickets for every
              registration.
            </p>
            <p className="text-xs text-white/50 font-body mb-4">
              Don't have one yet?{" "}
              <a
                href="https://hub.bsvblockchain.org/demos-and-onboardings/onboardings/onboarding-catalog/metanet-desktop-mainnet"
                target="_blank"
                rel="noreferrer"
                className="text-bsva-cyan hover:text-white transition-colors"
              >
                Install MetaNet Desktop ↗
              </a>
            </p>
            <Button
              variant="primary"
              onClick={() => void connect()}
              disabled={walletLoading || !info?.enabled}
            >
              {walletLoading ? "Connecting…" : "Connect browser wallet"}
            </Button>
            {!info?.enabled && (
              <p className="text-xs text-white/40 font-body mt-3">
                Enable BSV mode first (see the panel on the left).
              </p>
            )}
            {walletError && <ErrorBanner>{walletError}</ErrorBanner>}
          </>
        ) : (
          <>
            <dl className="grid grid-cols-[120px_1fr] gap-y-2.5 text-sm font-body mb-5">
              <dt className="text-white/50">Connected as</dt>
              <dd className="text-bsva-cyan font-mono text-xs break-all" title={identityKey ?? undefined}>
                {truncateKey(identityKey, 12, 8)}
              </dd>
            </dl>

            <form onSubmit={onFund} className="space-y-3">
              <label className="block">
                <span className="block text-xs font-body text-white/60 mb-1">Amount (sats)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white font-body focus:outline-none focus:border-bsva-cyan focus:bg-white/10 transition-colors"
                />
              </label>
              <Button type="submit" variant="primary" disabled={funding} className="w-full">
                {funding ? "Sending…" : `Send ${Number(amount || 0).toLocaleString()} sats to server`}
              </Button>
            </form>

            {fundError && <ErrorBanner>{fundError}</ErrorBanner>}

            {lastTxid && (
              <div className="mt-4 rounded-lg border border-bsva-cyan/30 bg-bsva-cyan/[0.06] p-3 text-sm font-body">
                <div className="text-bsva-cyan font-display font-semibold mb-1">
                  ✓ Funding tx broadcast
                </div>
                <div className="font-mono text-xs text-white/80 break-all">{lastTxid}</div>
                <div className="text-white/50 text-xs mt-2">
                  The server wallet will pick up the new UTXO momentarily — refresh the panel on
                  the left to see the updated balance.
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 font-body"
    >
      <span className="font-display font-semibold text-red-300 leading-5">!</span>
      <div className="flex-1 leading-5">{children}</div>
    </div>
  );
}
