import { Router } from "express";
import { z } from "zod";
import {
  createServerPaymentRequest,
  getServerWalletInfo,
  receiveServerPayment,
} from "../services/bsv.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";

export const adminRouter: Router = Router();

// ── GET /api/admin/wallet/info ───────────────────────────────
// Snapshot of the server wallet for the admin dashboard. Always returns
// 200 with a structured payload (even when BSV mode is disabled or the
// wallet failed to construct) so the UI can render an informative state.
adminRouter.get(
  "/wallet/info",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const info = await getServerWalletInfo();
    res.json({ wallet: info });
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
