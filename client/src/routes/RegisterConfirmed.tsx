import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import type { Registration } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { formatEventDateTime } from "../lib/format.js";
import {
  METANET_DESKTOP_INSTALL_URL,
  signIssueCertChallenge,
  useAttendeeWallet,
} from "../lib/attendee-wallet.js";

interface State {
  registration: Registration;
  event: {
    title: string;
    starts_at: string;
    ends_at: string | null;
    location: string | null;
    is_virtual: boolean;
    meeting_url: string | null;
    cover_url: string | null;
  } | null;
  whats_on_chain_url: string | null;
  ord_whats_on_chain_url: string | null;
  ticket_svg_url: string;
}

export function RegisterConfirmed() {
  const { id } = useParams();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .registration(id)
      .then((r) => setState(r))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "failed"));
  }, [id]);

  useEffect(() => {
    if (!state) return;
    // Real ticket → QR encodes a WhatsOnChain URL so a phone scan opens
    // the on-chain proof directly. Stub or missing tx → fall back to the
    // confirmation page so the QR still scans to something useful.
    const payload =
      state.whats_on_chain_url ?? `${window.location.origin}/r/${state.registration.id}`;
    QRCode.toString(payload, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#FFFFFF", light: "#00000000" },
    }).then(setQrSvg);
  }, [state]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-16">
        <GlassCard className="p-8 text-center text-white/80 font-body">
          We couldn't find that ticket.
        </GlassCard>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-16">
        <GlassCard className="p-12 animate-pulse">
          <div className="h-6 w-1/2 bg-white/10 rounded mb-4" />
          <div className="h-4 w-1/3 bg-white/10 rounded" />
        </GlassCard>
      </div>
    );
  }

  const { registration, event } = state;
  const isStub = registration.tx_id?.startsWith("stub-");

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-2xl mx-auto px-6 pt-16 pb-24"
    >
      <GlassCard strong className="p-8 sm:p-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-bsva-cyan/15 text-bsva-cyan text-xs font-display font-semibold uppercase tracking-wider mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-bsva-cyan" />
          You're in
        </div>

        <h1 className="font-display font-semibold text-3xl sm:text-4xl text-white mb-3">
          {event?.title ?? "Your event"}
        </h1>

        {event && (
          <div className="text-white/70 font-body mb-8">
            {formatEventDateTime(event.starts_at)}
            {" · "}
            {event.is_virtual ? "Online" : event.location ?? "TBA"}
          </div>
        )}

        <TicketPreview src={state.ticket_svg_url} />
        {qrSvg && (
          <details className="mb-6 text-white/60 font-body text-xs">
            <summary className="cursor-pointer text-bsva-cyan hover:text-white transition-colors">
              Show plain QR
            </summary>
            <div
              className="mx-auto mt-3 w-40 h-40 p-3 rounded-xl bg-white/[0.04] border border-white/10"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </details>
        )}

        {registration.ord_txid ? (
          <div className="text-left bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
              Ord ticket {registration.ord_txid.startsWith("stub-") && <span className="text-white/40 normal-case">(local stub)</span>}
            </div>
            <div className="font-mono text-xs text-white/80 break-all">{registration.ord_txid}</div>
            {state.ord_whats_on_chain_url && (
              <a
                href={state.ord_whats_on_chain_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full bg-bsva-blue text-white text-xs font-display font-semibold hover:bg-bsva-cyan hover:text-bsva-navy transition-colors"
              >
                View on WhatsOnChain ↗
              </a>
            )}
          </div>
        ) : (
          <div className="text-white/60 font-body text-sm mb-4">
            Your ticket is being inscribed. We'll email you when it's ready.
          </div>
        )}

        {registration.tx_id && (
          <div className="text-left bg-white/5 border border-white/10 rounded-lg p-4 mb-6">
            <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
              Check-in token {isStub && <span className="text-white/40 normal-case">(local stub)</span>}
            </div>
            <div className="font-mono text-xs text-white/80 break-all">
              {registration.tx_id}
            </div>
            {state.whats_on_chain_url && (
              <a
                href={state.whats_on_chain_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-bsva-cyan hover:text-white text-xs font-display font-semibold transition-colors"
              >
                View on WhatsOnChain ↗
              </a>
            )}
          </div>
        )}

        {event?.is_virtual && event.meeting_url && (
          <div className="mb-6 rounded-xl border border-bsva-cyan/40 bg-bsva-cyan/10 p-4 text-left">
            <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
              Meeting link
            </div>
            <a
              href={event.meeting_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bsva-navy text-white font-display font-semibold text-sm hover:bg-bsva-blue transition-colors"
            >
              Join the meeting ↗
            </a>
            <div className="mt-2 text-xs text-white/60 font-mono break-all">
              {event.meeting_url}
            </div>
          </div>
        )}

        <CertPanel
          registrationId={registration.id}
          certIssued={Boolean(registration.cert_issued_at)}
          attendeeIdentityKey={registration.attendee_identity_key ?? null}
          certSerial={registration.cert_serial ?? null}
          eventEndsAt={event?.ends_at ?? null}
          eventStartsAt={event?.starts_at ?? null}
          rewardClaimedAt={registration.reward_claimed_at ?? null}
          rewardSats={registration.reward_sats ?? null}
          onIssued={(cert) => {
            // Update local state so the UI reflects success without a refetch.
            setState((s) =>
              s
                ? {
                    ...s,
                    registration: {
                      ...s.registration,
                      attendee_identity_key: cert.attendeeIdentityKey,
                      cert_serial: cert.serial,
                      cert_issued_at: cert.issuedAt,
                    },
                  }
                : s,
            );
          }}
        />

        <div className="flex flex-wrap gap-3 justify-center">
          <Link to="/">
            <Button variant="secondary">← Back to events</Button>
          </Link>
          <a
            href="https://bsvassociation.org/bsv-browser"
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="primary">Download BSV Browser ↗</Button>
          </a>
        </div>
      </GlassCard>
    </motion.div>
  );
}

/**
 * Inline ticket preview, sourced from the local server-rendered SVG
 * endpoint. The same SVG is also inscribed as a 1sat ord on chain — if
 * users want to verify the on-chain artifact, the "View on WhatsOnChain"
 * button below the preview links to the tx where WoC renders it inline.
 */
function TicketPreview({ src }: { src: string }) {
  return (
    <div className="mx-auto mb-6 max-w-md rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
      <img src={src} alt="Your BE-on-BSV ticket" className="block w-full h-auto" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Cert panel — three states:
//   1. Wallet not connected → "Connect MetaNet Desktop" CTA
//   2. Wallet connected, cert not issued → "Issue cert" button
//   3. Cert issued → cert info + claim-reward placeholder (Branch 3 enables)
// ─────────────────────────────────────────────────────────────

interface CertPanelProps {
  registrationId: string;
  certIssued: boolean;
  attendeeIdentityKey: string | null;
  certSerial: string | null;
  eventEndsAt: string | null;
  eventStartsAt: string | null;
  rewardClaimedAt: string | null;
  rewardSats: number | null;
  onIssued: (cert: import("../lib/api.js").AttendeeCert) => void;
}

function CertPanel(props: CertPanelProps) {
  const { wallet, identityKey, loading: walletLoading, error: walletError, connect } =
    useAttendeeWallet();
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  const onIssue = useCallback(async () => {
    if (!wallet) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const { nonce } = await api.cert.challenge(props.registrationId);
      const { identityKey: pubkey, signature } = await signIssueCertChallenge({
        wallet,
        registrationId: props.registrationId,
        nonce,
      });
      const { cert } = await api.cert.issue(props.registrationId, {
        identityKey: pubkey,
        nonce,
        signature,
      });
      props.onIssued(cert);
    } catch (e) {
      setIssueError(e instanceof ApiError ? e.message : (e as Error).message ?? "issuance failed");
    } finally {
      setIssuing(false);
    }
  }, [wallet, props]);

  // ── State 3: cert already issued ──
  if (props.certIssued) {
    const ended =
      props.eventEndsAt
        ? new Date(props.eventEndsAt) < new Date()
        : props.eventStartsAt
          ? new Date(props.eventStartsAt) < new Date()
          : false;
    return (
      <div className="mb-6 rounded-xl border border-bsva-cyan/40 bg-bsva-cyan/[0.06] p-4 text-left">
        <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
          Registration certificate
        </div>
        <div className="text-white/80 font-body text-sm mb-2">
          ✓ Cert issued to your wallet.
        </div>
        {props.attendeeIdentityKey && (
          <div className="font-mono text-[11px] text-white/60 break-all mb-2">
            {props.attendeeIdentityKey}
          </div>
        )}
        {props.certSerial && (
          <div className="text-[11px] text-white/40 font-mono mb-3">
            serial {props.certSerial.slice(0, 8)}…{props.certSerial.slice(-4)}
          </div>
        )}
        {props.rewardClaimedAt ? (
          <div className="text-bsva-cyan font-display font-semibold text-sm">
            ✓ {props.rewardSats ?? 0} sats sent to your wallet.
          </div>
        ) : ended ? (
          <button
            disabled
            className="px-4 py-2 rounded-full bg-bsva-blue/40 text-white/70 font-display font-semibold text-sm cursor-not-allowed"
            title="Reward claim wires up in Branch 3"
          >
            Claim reward (coming soon)
          </button>
        ) : (
          <div className="text-white/60 font-body text-xs">
            Reward will be claimable after the event ends.
          </div>
        )}
      </div>
    );
  }

  // ── State 2: wallet connected, cert not yet issued ──
  if (wallet && identityKey) {
    return (
      <div className="mb-6 rounded-xl border border-bsva-cyan/40 bg-bsva-cyan/[0.06] p-4 text-left">
        <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
          Wallet connected
        </div>
        <div className="font-mono text-[11px] text-white/60 break-all mb-3">
          {identityKey}
        </div>
        {issueError && (
          <div className="text-red-300 font-body text-xs mb-3">{issueError}</div>
        )}
        <button
          onClick={onIssue}
          disabled={issuing}
          className="px-4 py-2 rounded-full bg-bsva-blue text-white font-display font-semibold text-sm hover:bg-bsva-cyan hover:text-bsva-navy transition-colors disabled:opacity-60"
        >
          {issuing ? "Issuing…" : "Issue my certificate"}
        </button>
      </div>
    );
  }

  // ── State 1: wallet not connected — CTA ──
  return (
    <div className="mb-6 rounded-xl border border-bsva-cyan/40 bg-gradient-to-br from-bsva-blue/20 to-bsva-cyan/10 p-5 text-left">
      <div className="text-xs uppercase tracking-wider text-bsva-cyan font-display font-semibold mb-2">
        Earn 100 sats
      </div>
      <div className="text-white/85 font-body text-sm leading-relaxed mb-4">
        Connect your BSV browser wallet to receive a registration certificate.
        After the event ends you'll be able to claim 100 sats from the server
        wallet — straight to your wallet.
      </div>
      {walletError && (
        <div className="text-red-300 font-body text-xs mb-3 leading-relaxed">
          {walletError}
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={connect}
          disabled={walletLoading}
          className="px-4 py-2 rounded-full bg-bsva-blue text-white font-display font-semibold text-sm hover:bg-bsva-cyan hover:text-bsva-navy transition-colors disabled:opacity-60"
        >
          {walletLoading ? "Connecting…" : "Connect wallet"}
        </button>
        <a
          href={METANET_DESKTOP_INSTALL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-bsva-cyan hover:text-white text-xs font-display font-semibold transition-colors"
        >
          Install MetaNet Desktop ↗
        </a>
      </div>
    </div>
  );
}
