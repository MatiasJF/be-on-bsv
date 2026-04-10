import { Router } from "express";
import { RegistrationInputSchema } from "@be-on-bsv/shared";
import { supabase } from "../services/supabase.js";
import { mintRegistrationTicket } from "../services/bsv.js";
import { sendRegistrationEmail } from "../services/email.js";
import { renderQrPngDataUrl } from "../services/qr.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import { whatsOnChainTxUrl } from "../lib/whatsonchain.js";
import { env } from "../env.js";

export const registrationsRouter: Router = Router();

// ── POST /api/register (public) ──────────────────────────────
registrationsRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = RegistrationInputSchema.parse(req.body);

    // 1. Validate the event exists and is not deleted.
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, title, starts_at, location, is_virtual")
      .eq("id", input.event_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (eventErr) throw new HttpError(500, eventErr.message);
    if (!event) throw new HttpError(404, "event_not_found");

    // 2. Insert the registration row. Unique constraint on (event_id, email)
    //    will reject duplicates with 23505.
    const { data: registration, error: insertErr } = await supabase
      .from("registrations")
      .insert({
        event_id: input.event_id,
        name: input.name,
        email: input.email,
        organization: input.organization ?? null,
      })
      .select("*")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        throw new HttpError(409, "already_registered");
      }
      throw new HttpError(500, insertErr.message);
    }

    // 3. Mint the PushDrop ticket. Failure does NOT roll back the registration —
    //    we keep the row, leave tx_id null, and let the admin retry later.
    let ticket: { tx_id: string; outpoint: string; stub: boolean } | null = null;
    try {
      ticket = await mintRegistrationTicket({
        eventId: event.id,
        registrationId: registration.id,
      });
      const { error: updErr } = await supabase
        .from("registrations")
        .update({ tx_id: ticket.tx_id, outpoint: ticket.outpoint })
        .eq("id", registration.id);
      if (updErr) {
        // eslint-disable-next-line no-console
        console.error("[register] failed to persist tx_id:", updErr.message);
      } else {
        registration.tx_id = ticket.tx_id;
        registration.outpoint = ticket.outpoint;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[register] mint failed:", err instanceof Error ? err.message : err);
    }

    // 4. Render QR + send confirmation email. Same isolation: failure here
    //    doesn't fail the request — registration is already persisted.
    try {
      const confirmationUrl = `${env.PUBLIC_APP_URL}/r/${registration.id}`;
      // QR encodes a WhatsOnChain link for real tickets so a phone scan
      // takes you straight to the on-chain proof. Stub tickets fall back
      // to the confirmation page so the QR still scans to something useful.
      const wocUrl = whatsOnChainTxUrl(ticket?.tx_id, env.BSV_NETWORK);
      const qrPayload = wocUrl ?? confirmationUrl;
      const qrPngDataUrl = await renderQrPngDataUrl(qrPayload);

      await sendRegistrationEmail({
        to: registration.email,
        name: registration.name,
        eventTitle: event.title,
        eventStartsAt: event.starts_at,
        eventLocation: event.location ?? null,
        isVirtual: event.is_virtual,
        txId: ticket?.tx_id ?? null,
        qrPngDataUrl,
        confirmationUrl,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[register] email failed:", err instanceof Error ? err.message : err);
    }

    res.status(201).json({
      registration,
      event_title: event.title,
      ticket,
    });
  }),
);

// ── GET /api/register/:id (public, by id only) ───────────────
// Used by the confirmation page so a guest can re-load their ticket via the
// link from the email. Returns registration + event title only — no admin data.
registrationsRouter.get(
  "/register/:id",
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, event_id, name, email, organization, tx_id, outpoint, created_at")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");

    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at, location, is_virtual, cover_url")
      .eq("id", reg.event_id)
      .maybeSingle();

    res.json({
      registration: reg,
      event,
      whats_on_chain_url: whatsOnChainTxUrl(reg.tx_id, env.BSV_NETWORK),
    });
  }),
);

// ── GET /api/registrations/:eventId (admin) ──────────────────
registrationsRouter.get(
  "/registrations/:eventId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("event_id", req.params.eventId)
      .order("created_at", { ascending: false });

    if (error) throw new HttpError(500, error.message);
    res.json({ registrations: data ?? [] });
  }),
);
