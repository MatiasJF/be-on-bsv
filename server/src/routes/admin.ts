import { Router } from "express";
import { z } from "zod";
import {
  createServerPaymentRequest,
  getServerWalletInfo,
  mintRegistrationTicket,
  mintTicketOrd,
  receiveServerPayment,
} from "../services/bsv.js";
import { renderTicketSvg, svgToBytes } from "../services/ticket-renderer.js";
import { supabase } from "../services/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import { env } from "../env.js";

export const adminRouter: Router = Router();

// ── GET /api/admin/wallet/info ───────────────────────────────
// Snapshot of the server wallet + operational health counters.
// Always returns 200 with a structured payload so the admin UI can
// render an informative state even when BSV mode is disabled or the
// wallet failed to construct.
adminRouter.get(
  "/wallet/info",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [info, pendingMintCount, pendingOrdCount] = await Promise.all([
      getServerWalletInfo(),
      countPendingByColumn("tx_id"),
      countPendingByColumn("ord_txid"),
    ]);
    res.json({ wallet: info, pendingMintCount, pendingOrdCount });
  }),
);

async function countPendingByColumn(column: "tx_id" | "ord_txid"): Promise<number> {
  // Registrations where this on-chain artifact failed or was never minted.
  const { count, error } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .is(column, null);
  if (error) return 0; // best-effort; don't fail the whole info call
  return count ?? 0;
}

// ── POST /api/admin/registrations/:id/mint ──────────────────
// Retry minting a PushDrop ticket for a single registration whose
// previous attempt failed (tx_id is NULL). Idempotent: if the
// registration already has a tx_id, returns 409 instead of duplicating.
adminRouter.post(
  "/registrations/:id/mint",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, event_id, tx_id")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (reg.tx_id) throw new HttpError(409, "already_minted");

    let ticket;
    try {
      ticket = await mintRegistrationTicket({
        eventId: reg.event_id,
        registrationId: reg.id,
      });
    } catch (err) {
      throw new HttpError(
        503,
        err instanceof Error ? err.message : "mint failed",
      );
    }

    const { error: updErr } = await supabase
      .from("registrations")
      .update({ tx_id: ticket.tx_id, outpoint: ticket.outpoint })
      .eq("id", reg.id);
    if (updErr) throw new HttpError(500, `persist: ${updErr.message}`);

    res.json({ ticket });
  }),
);

// ── POST /api/admin/registrations/:id/mint-ord ──────────────
// Retry minting the 1sat-ord ticket for a registration whose previous
// inscription failed (ord_txid is NULL). Idempotent: 409 if already minted.
adminRouter.post(
  "/registrations/:id/mint-ord",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, event_id, name, ord_txid, created_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (reg.ord_txid) throw new HttpError(409, "already_minted");

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("title, starts_at, location, is_virtual")
      .eq("id", reg.event_id)
      .maybeSingle();
    if (evErr) throw new HttpError(500, evErr.message);
    if (!ev) throw new HttpError(404, "event_not_found");

    const where = ev.is_virtual ? "Online" : ev.location ?? "TBA";
    const issuedAt = new Date().toISOString();
    const confirmationUrl = `${env.PUBLIC_APP_URL}/r/${reg.id}`;

    let ord;
    try {
      const svg = await renderTicketSvg({
        eventTitle: ev.title,
        name: reg.name,
        date: formatTicketDate(ev.starts_at),
        where,
        registrationId: reg.id,
        eventId: reg.event_id,
        issuedAt: formatTicketDate(issuedAt),
        qrPayload: confirmationUrl,
      });
      ord = await mintTicketOrd({
        eventId: reg.event_id,
        registrationId: reg.id,
        eventTitle: ev.title,
        name: reg.name,
        issuedAt,
        svgBytes: svgToBytes(svg),
      });
    } catch (err) {
      throw new HttpError(503, err instanceof Error ? err.message : "ord mint failed");
    }

    const { error: updErr } = await supabase
      .from("registrations")
      .update({
        ord_txid: ord.ord_txid,
        ord_outpoint: ord.ord_outpoint,
        ord_metadata_sha256: ord.ord_metadata_sha256,
      })
      .eq("id", reg.id);
    if (updErr) throw new HttpError(500, `persist: ${updErr.message}`);

    res.json({ ord });
  }),
);

// ── DELETE /api/admin/registrations/:id ─────────────────────
// Hard-delete a registration. Frees the (event_id, email) unique
// constraint so the same email can register again. On-chain artifacts
// (PushDrop + ord) remain on chain — this only removes our off-chain
// bookkeeping row.
adminRouter.delete(
  "/registrations/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("registrations")
      .delete()
      .eq("id", req.params.id);
    if (error) throw new HttpError(500, error.message);
    res.status(204).end();
  }),
);

function formatTicketDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ── GET /api/admin/wallet/funding-request ────────────────────
// Step 1 of the browser-wallet → server-wallet funding flow.
// Returns a BRC-29 PaymentRequest the browser wallet will sign against.
const fundingRequestQuery = z.object({
  satoshis: z.coerce.number().int().min(1).max(1_000_000_000),
  memo: z.string().max(200).optional(),
});
adminRouter.get(
  "/wallet/funding-request",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { satoshis, memo } = fundingRequestQuery.parse(req.query);
    try {
      const paymentRequest = await createServerPaymentRequest(
        satoshis,
        memo ?? "BE on BSV admin funding",
      );
      res.json({ paymentRequest });
    } catch (err) {
      throw new HttpError(
        503,
        err instanceof Error ? err.message : "failed to create payment request",
      );
    }
  }),
);

// ── POST /api/admin/wallet/funding-request ───────────────────
// Step 3 of the funding flow. The browser POSTs the tx bytes plus the
// derivation data; the server internalizes them via receiveDirectPayment.
const internalizeBody = z.object({
  tx: z.array(z.number().int().min(0).max(255)).min(1),
  senderIdentityKey: z.string().min(1),
  derivationPrefix: z.string().min(1),
  derivationSuffix: z.string().min(1),
  outputIndex: z.number().int().min(0),
  description: z.string().max(200).optional(),
});
adminRouter.post(
  "/wallet/funding-request",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = internalizeBody.parse(req.body);
    try {
      await receiveServerPayment(body);
      res.status(200).json({ success: true });
    } catch (err) {
      throw new HttpError(
        503,
        err instanceof Error ? err.message : "failed to internalize payment",
      );
    }
  }),
);
