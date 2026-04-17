import { Router } from "express";
import { z } from "zod";
import {
  createServerPaymentRequest,
  getServerWalletInfo,
  mintRegistrationTicket,
  receiveServerPayment,
} from "../services/bsv.js";
import { supabase } from "../services/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";

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
    const [info, pendingMintCount] = await Promise.all([
      getServerWalletInfo(),
      countPendingMints(),
    ]);
    res.json({ wallet: info, pendingMintCount });
  }),
);

async function countPendingMints(): Promise<number> {
  // Registrations where the BSV mint failed or was never attempted —
  // these are the ones the admin can retry.
  const { count, error } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .is("tx_id", null);
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
