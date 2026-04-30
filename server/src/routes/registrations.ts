import { Router } from "express";
import { RegistrationInputSchema } from "@be-on-bsv/shared";
import { supabase } from "../services/supabase.js";
import { mintRegistrationTicket, mintTicketOrd } from "../services/bsv.js";
import { sendRegistrationEmail } from "../services/email.js";
import { renderQrPngDataUrl } from "../services/qr.js";
import { renderTicketSvg, svgToBytes } from "../services/ticket-renderer.js";
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
      .select("id, title, starts_at, ends_at, location, is_virtual, meeting_url")
      .eq("id", input.event_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (eventErr) throw new HttpError(500, eventErr.message);
    if (!event) throw new HttpError(404, "event_not_found");

    // Reject registrations on past events. UI hides the form already; this
    // is the server-side safety net for direct API calls.
    const cutoff = event.ends_at ?? event.starts_at;
    if (new Date(cutoff).getTime() < Date.now()) {
      throw new HttpError(410, "event_has_ended");
    }

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

    // 4. Mint the 1sat-ord ticket (separate isolation from the PushDrop).
    //    The ord carries the rendered SVG + signed metadata and is the
    //    visible artifact on ord-aware viewers.
    const confirmationUrl = `${env.PUBLIC_APP_URL}/r/${registration.id}`;
    const issuedAt = new Date().toISOString();
    let ord: { ord_txid: string; ord_outpoint: string; stub: boolean } | null = null;
    let svgBytes: Uint8Array | null = null;
    try {
      const svg = await renderTicketSvg({
        eventTitle: event.title,
        name: registration.name,
        date: formatTicketDate(event.starts_at),
        where: event.is_virtual ? "Online" : event.location ?? "TBA",
        registrationId: registration.id,
        eventId: event.id,
        issuedAt: formatTicketDate(issuedAt),
        qrPayload: confirmationUrl,
      });
      svgBytes = svgToBytes(svg);

      const ordResult = await mintTicketOrd({
        eventId: event.id,
        registrationId: registration.id,
        eventTitle: event.title,
        name: registration.name,
        issuedAt,
        svgBytes,
      });
      ord = {
        ord_txid: ordResult.ord_txid,
        ord_outpoint: ordResult.ord_outpoint,
        stub: ordResult.stub,
      };
      const { error: ordPersistErr } = await supabase
        .from("registrations")
        .update({
          ord_txid: ordResult.ord_txid,
          ord_outpoint: ordResult.ord_outpoint,
          ord_metadata_sha256: ordResult.ord_metadata_sha256,
        })
        .eq("id", registration.id);
      if (ordPersistErr) {
        // eslint-disable-next-line no-console
        console.error("[register] failed to persist ord_*:", ordPersistErr.message);
      } else {
        registration.ord_txid = ordResult.ord_txid;
        registration.ord_outpoint = ordResult.ord_outpoint;
        registration.ord_metadata_sha256 = ordResult.ord_metadata_sha256;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[register] ord mint failed:", err instanceof Error ? err.message : err);
    }

    // 5. Render QR + send confirmation email. Same isolation: failure here
    //    doesn't fail the request — registration is already persisted.
    try {
      // The QR encodes the WhatsOnChain tx URL (ord tx preferred, then
      // PushDrop, then the confirmation page) so a phone scan opens the
      // on-chain proof on the only viewer surface we expose.
      const ordWocUrl = whatsOnChainTxUrl(ord?.ord_txid, env.BSV_NETWORK);
      const wocUrl = whatsOnChainTxUrl(ticket?.tx_id, env.BSV_NETWORK);
      const qrPayload = ordWocUrl ?? wocUrl ?? confirmationUrl;
      const qrPngDataUrl = await renderQrPngDataUrl(qrPayload);

      await sendRegistrationEmail({
        to: registration.email,
        name: registration.name,
        eventTitle: event.title,
        eventStartsAt: event.starts_at,
        eventLocation: event.location ?? null,
        isVirtual: event.is_virtual,
        meetingUrl: event.meeting_url ?? null,
        txId: ticket?.tx_id ?? null,
        qrPngDataUrl,
        confirmationUrl,
        whatsOnChainUrl: ordWocUrl ?? wocUrl,
        rewardSats: env.REWARD_SATS,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[register] email failed:", err instanceof Error ? err.message : err);
    }

    res.status(201).json({
      registration,
      event_title: event.title,
      ticket,
      ord,
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
      .select(
        "id, event_id, name, email, organization, tx_id, outpoint, ord_txid, ord_outpoint, ord_metadata_sha256, attendee_identity_key, cert_serial, cert_issued_at, reward_sats, reward_txid, reward_claimed_at, created_at",
      )
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");

    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at, ends_at, location, is_virtual, meeting_url, cover_url")
      .eq("id", reg.event_id)
      .maybeSingle();

    res.json({
      registration: reg,
      event,
      whats_on_chain_url: whatsOnChainTxUrl(reg.tx_id, env.BSV_NETWORK),
      ord_whats_on_chain_url: whatsOnChainTxUrl(reg.ord_txid, env.BSV_NETWORK),
      reward_whats_on_chain_url: whatsOnChainTxUrl(reg.reward_txid, env.BSV_NETWORK),
      // Current REWARD_SATS for the CTA copy. The actual paid amount is
      // recorded as `registration.reward_sats` on claim.
      reward_sats_config: env.REWARD_SATS,
      // Relative path: served by this same Express app, so the browser
      // resolves it against the page host. Avoids depending on
      // PUBLIC_APP_URL being correctly configured for the page to work.
      ticket_svg_url: `/api/register/${reg.id}/ticket.svg`,
    });
  }),
);

// ── GET /api/register/:id/ticket.svg (public, by id only) ────
// Server-side render of the BE-on-BSV ticket as SVG. This is the same
// artifact that gets inscribed on-chain as the 1sat ordinal — keeping
// it accessible over HTTP gives us a stable preview and a fallback when
// the on-chain viewer is unreachable.
registrationsRouter.get(
  "/register/:id/ticket.svg",
  asyncHandler(async (req, res) => {
    const { data: reg, error } = await supabase
      .from("registrations")
      .select("id, event_id, name, created_at")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!reg) throw new HttpError(404, "registration_not_found");

    const { data: event } = await supabase
      .from("events")
      .select("title, starts_at, location, is_virtual")
      .eq("id", reg.event_id)
      .maybeSingle();
    if (!event) throw new HttpError(404, "event_not_found");

    const where = event.is_virtual ? "Online" : event.location ?? "TBA";
    const date = formatTicketDate(event.starts_at);
    const issuedAt = formatTicketDate(reg.created_at);
    const qrPayload = `${env.PUBLIC_APP_URL}/r/${reg.id}`;

    const svg = await renderTicketSvg({
      eventTitle: event.title,
      name: reg.name,
      date,
      where,
      registrationId: reg.id,
      eventId: reg.event_id,
      issuedAt,
      qrPayload,
    });

    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(svg);
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
