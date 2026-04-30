import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabase } from "../services/supabase.js";
import { issueServerSignedAttendeeCert, sendReward } from "../services/bsv.js";
import {
  buildSignedFetchMessage,
  verifyWalletSignature,
} from "../services/attendee-certs.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import { env } from "../env.js";

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
  /**
   * Tags the action this nonce was issued for so a nonce minted for
   * cert issuance cannot be replayed against the reward-claim endpoint
   * (and vice versa).
   */
  action: "issue-cert" | "claim-reward";
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
    challenges.set(nonce, {
      nonce,
      registrationId: reg.id,
      action: "issue-cert",
      expiresAt,
    });

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
    if (challenge.action !== "issue-cert") {
      throw new HttpError(400, "nonce_action_mismatch");
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

// ── GET /api/register/:id/claim-reward-challenge ─────────────
// Issues a nonce for the reward-claim signed-fetch flow. Mirrors
// /cert-challenge but checks (a) the cert exists and (b) the reward
// hasn't already been paid before issuing, so a wallet without a cert
// or an already-paid registration can't even start the flow.
certsRouter.get(
  "/register/:id/claim-reward-challenge",
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, cert_serial, reward_claimed_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (!reg.cert_serial) throw new HttpError(409, "cert_not_issued");
    if (reg.reward_claimed_at) throw new HttpError(409, "reward_already_claimed");

    purgeExpiredChallenges();
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = Date.now() + CHALLENGE_TTL_MS;
    challenges.set(nonce, {
      nonce,
      registrationId: reg.id,
      action: "claim-reward",
      expiresAt,
    });

    res.json({ nonce, expiresAt: new Date(expiresAt).toISOString() });
  }),
);

// ── POST /api/register/:id/claim-reward ──────────────────────
// Verifies the cert holder controls the recorded identity key, checks
// the event has ended and the reward hasn't been paid, sends N sats via
// BRC-29 P2PKH to the wallet's identity key, and persists the claim.
const claimRewardBody = z.object({
  /** Hex-encoded wallet identity pubkey — must match the stored cert holder. */
  identityKey: z.string().regex(/^[0-9a-f]{66}$/i, "must be 33-byte hex pubkey"),
  nonce: z.string().min(16),
  signature: z.string().regex(/^[0-9a-f]+$/i),
});

certsRouter.post(
  "/register/:id/claim-reward",
  asyncHandler(async (req, res) => {
    const body = claimRewardBody.parse(req.body);

    purgeExpiredChallenges();
    const challenge = challenges.get(body.nonce);
    if (!challenge) throw new HttpError(400, "nonce_unknown_or_expired");
    if (challenge.registrationId !== req.params.id) {
      throw new HttpError(400, "nonce_registration_mismatch");
    }
    if (challenge.action !== "claim-reward") {
      throw new HttpError(400, "nonce_action_mismatch");
    }

    const path = `/api/register/${req.params.id}/claim-reward`;
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

    challenges.delete(body.nonce);

    // Re-pull registration + event under the same nonce window so we
    // can't race a concurrent claim or hit a stale snapshot.
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select(
        "id, event_id, name, attendee_identity_key, cert_serial, reward_claimed_at",
      )
      .eq("id", req.params.id)
      .maybeSingle();
    if (regErr) throw new HttpError(500, regErr.message);
    if (!reg) throw new HttpError(404, "registration_not_found");
    if (!reg.cert_serial) throw new HttpError(409, "cert_not_issued");
    if (reg.reward_claimed_at) throw new HttpError(409, "reward_already_claimed");
    if (reg.attendee_identity_key !== body.identityKey) {
      throw new HttpError(403, "identity_key_mismatch");
    }

    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("title, starts_at, ends_at")
      .eq("id", reg.event_id)
      .maybeSingle();
    if (evErr) throw new HttpError(500, evErr.message);
    if (!event) throw new HttpError(404, "event_not_found");

    // Reward unlocks after `ends_at` if set, else after `starts_at + 1h`
    // as a fallback so events with no explicit end time still close out.
    const now = Date.now();
    const unlockAt = event.ends_at
      ? new Date(event.ends_at).getTime()
      : new Date(event.starts_at).getTime() + 60 * 60 * 1000;
    if (now < unlockAt) {
      throw new HttpError(425, "event_not_ended");
    }

    if (env.REWARD_SATS <= 0) {
      throw new HttpError(503, "rewards_disabled");
    }

    let send;
    try {
      send = await sendReward({
        identityKey: body.identityKey,
        satoshis: env.REWARD_SATS,
        description: `BE-on-BSV reward: ${event.title}`,
      });
    } catch (err) {
      throw new HttpError(503, err instanceof Error ? err.message : "send failed");
    }

    const claimedAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("registrations")
      .update({
        reward_txid: send.txid,
        reward_sats: env.REWARD_SATS,
        reward_claimed_at: claimedAt,
      })
      .eq("id", reg.id);
    if (updErr) throw new HttpError(500, `persist: ${updErr.message}`);

    res.json({
      reward: {
        txid: send.txid,
        sats: env.REWARD_SATS,
        claimed_at: claimedAt,
      },
    });
  }),
);
