import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabase } from "../services/supabase.js";
import { issueServerSignedAttendeeCert } from "../services/bsv.js";
import {
  buildSignedFetchMessage,
  verifyWalletSignature,
} from "../services/attendee-certs.js";
import { HttpError, asyncHandler } from "../middleware/error.js";

export const certsRouter: Router = Router();

/**
 * Cert-issuance flow on the public confirmation page.
 *
 *  1. Browser GETs /api/register/:id/cert-challenge → server returns a
 *     short-lived nonce. Stored in-memory; expires in 5 minutes.
 *  2. Browser's wallet signs canonicalJson({path,method,nonce,body}) using
 *     BRC-43 protocol+key derivation. APH's `walletSignedFetch` pattern.
 *  3. Browser POSTs /api/register/:id/issue-cert with
 *     { identityKey, nonce, signature } — server verifies the sig, calls
 *     the wallet to issue a server-signed cert, persists identity key +
 *     serial, returns the cert JSON for the client to keep.
 */

// ── in-memory nonce cache ────────────────────────────────────
// Single-process, no persistence across restarts. Sufficient for the
// 5-minute issuance window — if the process restarts mid-flow the user
// retries. Render's free tier sleeps after inactivity; the user just
// gets a fresh challenge on retry, so this is acceptable.
interface PendingChallenge {
  nonce: string;
  registrationId: string;
  expiresAt: number;
}
const challenges = new Map<string, PendingChallenge>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function purgeExpiredChallenges(): void {
  const now = Date.now();
  for (const [key, ch] of challenges) {
    if (ch.expiresAt < now) challenges.delete(key);
  }
}

// ── GET /api/register/:id/cert-challenge ──────────────────────
certsRouter.get(
  "/register/:id/cert-challenge",
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, cert_serial")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (reg.cert_serial) throw new HttpError(409, "cert_already_issued");

    purgeExpiredChallenges();
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    challenges.set(nonce, { nonce, registrationId: reg.id, expiresAt });

    res.json({ nonce, expiresAt: new Date(expiresAt).toISOString() });
  }),
);

// ── POST /api/register/:id/issue-cert ─────────────────────────
const issueCertBody = z.object({
  /** Hex-encoded wallet identity pubkey returned by createWallet(). */
  identityKey: z.string().regex(/^[0-9a-f]{66}$/i, "must be 33-byte hex pubkey"),
  /** Nonce from /cert-challenge. */
  nonce: z.string().min(16),
  /** Hex-encoded DER signature over canonicalJson({path,method,nonce,body:""}). */
  signature: z.string().regex(/^[0-9a-f]+$/i),
});

certsRouter.post(
  "/register/:id/issue-cert",
  asyncHandler(async (req, res) => {
    const body = issueCertBody.parse(req.body);

    purgeExpiredChallenges();
    const challenge = challenges.get(body.nonce);
    if (!challenge) throw new HttpError(400, "nonce_unknown_or_expired");
    if (challenge.registrationId !== req.params.id) {
      throw new HttpError(400, "nonce_registration_mismatch");
    }

    const path = `/api/register/${req.params.id}/issue-cert`;
    const message = buildSignedFetchMessage({
      path,
      method: "POST",
      nonce: body.nonce,
      body: "",
    });

    const sigValid = verifyWalletSignature({
      identityKey: body.identityKey,
      signatureHex: body.signature,
      message,
    });
    if (!sigValid) throw new HttpError(401, "signature_invalid");

    // Burn the nonce so it can't be replayed.
    challenges.delete(body.nonce);

    // Pull the registration + event (need title + email for cert payload).
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select("id, event_id, name, email, cert_serial")
      .eq("id", req.params.id)
      .maybeSingle();
    if (regErr) throw new HttpError(500, regErr.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (reg.cert_serial) throw new HttpError(409, "cert_already_issued");

    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, title")
      .eq("id", reg.event_id)
      .maybeSingle();
    if (evErr) throw new HttpError(500, evErr.message);
    if (!event) throw new HttpError(404, "event_not_found");

    let cert;
    try {
      cert = await issueServerSignedAttendeeCert({
        eventId: event.id,
        registrationId: reg.id,
        eventTitle: event.title,
        name: reg.name,
        email: reg.email,
        attendeeIdentityKey: body.identityKey,
      });
    } catch (err) {
      throw new HttpError(503, err instanceof Error ? err.message : "cert issuance failed");
    }

    const { error: updErr } = await supabase
      .from("registrations")
      .update({
        attendee_identity_key: body.identityKey,
        cert_serial: cert.serial,
        cert_issued_at: cert.issuedAt,
      })
      .eq("id", reg.id);
    if (updErr) throw new HttpError(500, `persist: ${updErr.message}`);

    res.status(201).json({ cert });
  }),
);
