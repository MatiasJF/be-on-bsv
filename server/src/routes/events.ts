import { Router } from "express";
import multer from "multer";
import {
  EventInputSchema,
  EventListQuerySchema,
} from "@be-on-bsv/shared";
import { supabase } from "../services/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";
import {
  EVENTS_WITH_SPEAKERS_SELECT,
  flattenEventSpeakers,
  syncEventSpeakers,
} from "../lib/speakers.js";

export const eventsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — covers 4K JPEGs and most GIFs
});

// ── GET /api/events ──────────────────────────────────────────
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = EventListQuerySchema.parse(req.query);
    const nowIso = new Date().toISOString();

    let q = supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .is("deleted_at", null)
      .range(query.offset, query.offset + query.limit - 1);

    if (query.status === "upcoming") {
      q = q.gte("starts_at", nowIso).order("starts_at", { ascending: true });
    } else if (query.status === "past") {
      q = q.lt("starts_at", nowIso).order("starts_at", { ascending: false });
    } else {
      q = q.order("starts_at", { ascending: false });
    }

    if (query.tag) {
      q = q.contains("tags", [query.tag]);
    }

    const { data, error } = await q;
    if (error) throw new HttpError(500, error.message);
    const events = (data ?? []).map((row) =>
      flattenEventSpeakers(row as Record<string, unknown>),
    );
    res.json({ events });
  }),
);

// ── GET /api/events/:id ──────────────────────────────────────
eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, "event_not_found");
    res.json({ event: flattenEventSpeakers(data as Record<string, unknown>) });
  }),
);

// ── POST /api/events (admin) ─────────────────────────────────
eventsRouter.post(
  "/",
  requireAdmin,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    const body = parseEventBody(req.body);
    const input = EventInputSchema.parse(body);
    const { speakers, ...eventFields } = input;

    let coverUrl = eventFields.cover_url ?? null;
    if (req.file) {
      coverUrl = await uploadCover(req.file);
    }

    // Insert the event row (flat columns only — speakers go in the
    // join table in a second step below).
    const { data: created, error } = await supabase
      .from("events")
      .insert({ ...eventFields, cover_url: coverUrl })
      .select("id")
      .single();
    if (error || !created) throw new HttpError(500, error?.message ?? "insert failed");

    // Sync speakers if provided. Backward-compat: if the caller is an
    // older client that still sends host_name, synthesize one speaker
    // so the new-model pages show it.
    if (speakers !== undefined) {
      await syncEventSpeakers(created.id, speakers);
    } else if (eventFields.host_name && eventFields.host_name.trim().length > 0) {
      await syncEventSpeakers(created.id, [
        {
          name: eventFields.host_name.trim(),
          bio: eventFields.host_bio ?? null,
          avatar_url: eventFields.host_avatar ?? null,
          role: "host",
          position: 0,
        },
      ]);
    }

    // Re-read the event with speakers so the client gets the final shape.
    const { data: full, error: readErr } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", created.id)
      .maybeSingle();
    if (readErr || !full) throw new HttpError(500, readErr?.message ?? "reread failed");

    res.status(201).json({ event: flattenEventSpeakers(full as Record<string, unknown>) });
  }),
);

// ── PUT /api/events/:id (admin) ──────────────────────────────
eventsRouter.put(
  "/:id",
  requireAdmin,
  upload.single("cover"),
  asyncHandler(async (req, res) => {
    const body = parseEventBody(req.body);
    const input = EventInputSchema.parse(body);
    const { speakers, ...eventFields } = input;

    let coverUrl = eventFields.cover_url ?? null;
    if (req.file) {
      coverUrl = await uploadCover(req.file);
    }

    const { data: updated, error } = await supabase
      .from("events")
      .update({ ...eventFields, cover_url: coverUrl })
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!updated) throw new HttpError(404, "event_not_found");

    // Sync speakers only when the caller provided the array explicitly.
    // Partial-update semantics: omitting `speakers` leaves existing
    // event_speakers rows untouched.
    if (speakers !== undefined) {
      await syncEventSpeakers(updated.id, speakers);
    }

    const { data: full, error: readErr } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", updated.id)
      .maybeSingle();
    if (readErr || !full) throw new HttpError(500, readErr?.message ?? "reread failed");

    res.json({ event: flattenEventSpeakers(full as Record<string, unknown>) });
  }),
);

// ── DELETE /api/events/:id (admin, soft-delete) ──────────────
eventsRouter.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from("events")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", req.params.id);

    if (error) throw new HttpError(500, error.message);
    res.status(204).end();
  }),
);

// ── helpers ──────────────────────────────────────────────────

/**
 * multer + multipart sends everything as strings. Coerce the few non-string
 * fields back to their real shapes before zod parsing.
 */
function parseEventBody(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.is_virtual === "string") {
    out.is_virtual = out.is_virtual === "true";
  }
  if (typeof out.tags === "string") {
    try {
      out.tags = JSON.parse(out.tags);
    } catch {
      out.tags = (out.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
    }
  }
  // multipart serializes arrays as JSON strings; parse `speakers` the
  // same way we parse `tags` so the client can send it over FormData.
  if (typeof out.speakers === "string") {
    try {
      out.speakers = JSON.parse(out.speakers);
    } catch {
      out.speakers = undefined;
    }
  }
  // Strip empty strings → null so zod's .nullable() accepts them
  for (const k of ["ends_at", "location", "host_name", "host_bio", "host_avatar", "cover_url"]) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

async function uploadCover(file: Express.Multer.File): Promise<string> {
  const ext = (file.originalname.split(".").pop() || "bin").toLowerCase();
  const key = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { error } = await supabase.storage
    .from("event-covers")
    .upload(key, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) throw new HttpError(500, `cover upload failed: ${error.message}`);

  const { data } = supabase.storage.from("event-covers").getPublicUrl(key);
  return data.publicUrl;
}
