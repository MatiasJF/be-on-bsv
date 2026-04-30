import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import type { Registration } from "@be-on-bsv/shared";
import { api, ApiError } from "../lib/api.js";
import { GlassCard } from "../components/GlassCard.js";
import { Button } from "../components/Button.js";
import { formatEventDateTime } from "../lib/format.js";

interface State {
  registration: Registration;
  event: {
    title: string;
    starts_at: string;
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
