import { Router } from "express";
import { supabase } from "../services/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import { streamRegistrationsCsv, type RegistrationCsvRow } from "../services/csv.js";

export const exportsRouter: Router = Router();

// ── GET /api/export/:eventId (admin) ─────────────────────────
exportsRouter.get(
  "/export/:eventId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("title")
      .eq("id", req.params.eventId)
      .maybeSingle();

    if (eventErr) throw new HttpError(500, eventErr.message);
    if (!event) throw new HttpError(404, "event_not_found");

    const { data: registrations, error } = await supabase
      .from("registrations")
      .select("name, email, organization, tx_id, created_at")
      .eq("event_id", req.params.eventId)
      .order("created_at", { ascending: true });

    if (error) throw new HttpError(500, error.message);

    const rows: RegistrationCsvRow[] = (registrations ?? []).map((r) => ({
      Name: r.name,
      Email: r.email,
      Organization: r.organization ?? "",
      Timestamp: r.created_at,
      "Event Name": event.title,
      TxID: r.tx_id ?? "",
    }));

    const safeName = event.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 60);
    const filename = `${safeName}_registrations.csv`;

    streamRegistrationsCsv(res, rows, filename);
  }),
);
