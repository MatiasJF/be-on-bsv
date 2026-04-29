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
  isMissingSpeakersTable,
  syncEventSpeakers,
} from "../lib/speakers.js";

export const eventsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — covers 4K JPEGs and most GIFs
});

/**
 * Resolve whether the caller is an authenticated admin. Used on the
 * public GET endpoints to decide whether to strip private fields like
 * `meeting_url`. Returns false on any failure (no header, bad token,
 * non-admin role) — never throws, so anonymous requests still succeed.
 */
async function isAdminRequest(req: import("express").Request): Promise<boolean> {
  const auth = req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return false;
  try {
    const { data, error } = await supabase.auth.getUser(auth.slice(7).trim());
    if (error || !data.user) return false;
    const role =
      (data.user.app_metadata as { role?: string } | undefined)?.role ??
      (data.user.user_metadata as { role?: string } | undefined)?.role;
    return role === "admin";
  } catch {
    return false;
  }
}

// ── GET /api/events ──────────────────────────────────────────
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = EventListQuerySchema.parse(req.query);
    const nowIso = new Date().toISOString();

    // Build a query factory so we can retry without duplicating the
    // filter chain if the speakers-join fails (migration 003 not applied).
    const buildQuery = (selectCols: string) => {
      let q = supabase
        .from("events")
        .select(selectCols)
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
      return q;
    };

    let { data, error } = await buildQuery(EVENTS_WITH_SPEAKERS_SELECT);
    if (error && isMissingSpeakersTable(error)) {
      // 003_speakers.sql hasn't been applied yet. Fall back to the
      // pre-migration shape; flattenEventSpeakers will synthesize a
      // single speaker from host_* on each row.
      // eslint-disable-next-line no-console
      console.warn(
        "[events] speakers join failed (migration 003 not applied?). Falling back to plain select.",
      );
      ({ data, error } = await buildQuery("*"));
    }
    if (error) throw new HttpError(500, error.message);

    const admin = await isAdminRequest(req);
    const events = (data ?? [])
      .map((row) => flattenEventSpeakers(row as unknown as Record<string, unknown>))
      .map((e) => (admin ? e : stripPrivateFields(e)));
    res.json({ events });
  }),
);

// ── GET /api/events/:id ──────────────────────────────────────
eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    let { data, error } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error && isMissingSpeakersTable(error)) {
      ({ data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", req.params.id)
        .is("deleted_at", null)
        .maybeSingle());
    }

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, "event_not_found");
    const flat = flattenEventSpeakers(data as unknown as Record<string, unknown>);
    const admin = await isAdminRequest(req);
    res.json({ event: admin ? flat : stripPrivateFields(flat) });
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
    // so the new-model pages show it. Silently skipped if the migration
    // isn't applied yet (speakers tables missing) — the event row was
    // still inserted successfully.
    try {
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
    } catch (err) {
      if (!isMissingSpeakersTable(err)) throw err;
      // eslint-disable-next-line no-console
      console.warn("[events] skipping speakers sync — migration 003 not applied");
    }

    // Re-read the event with speakers so the client gets the final shape.
    let { data: full, error: readErr } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", created.id)
      .maybeSingle();
    if (readErr && isMissingSpeakersTable(readErr)) {
      ({ data: full, error: readErr } = await supabase
        .from("events")
        .select("*")
        .eq("id", created.id)
        .maybeSingle());
    }
    if (readErr || !full) throw new HttpError(500, readErr?.message ?? "reread failed");

    res.status(201).json({ event: flattenEventSpeakers(full as unknown as Record<string, unknown>) });
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
    // event_speakers rows untouched. Migration-missing errors are
    // treated as "nothing to sync" rather than failing the whole update.
    if (speakers !== undefined) {
      try {
        await syncEventSpeakers(updated.id, speakers);
      } catch (err) {
        if (!isMissingSpeakersTable(err)) throw err;
        // eslint-disable-next-line no-console
        console.warn("[events] skipping speakers sync — migration 003 not applied");
      }
    }

    let { data: full, error: readErr } = await supabase
      .from("events")
      .select(EVENTS_WITH_SPEAKERS_SELECT)
      .eq("id", updated.id)
      .maybeSingle();
    if (readErr && isMissingSpeakersTable(readErr)) {
      ({ data: full, error: readErr } = await supabase
        .from("events")
        .select("*")
        .eq("id", updated.id)
        .maybeSingle());
    }
    if (readErr || !full) throw new HttpError(500, readErr?.message ?? "reread failed");

    res.json({ event: flattenEventSpeakers(full as unknown as Record<string, unknown>) });
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
  for (const k of ["ends_at", "location", "meeting_url", "host_name", "host_bio", "host_avatar", "cover_url"]) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

/**
 * Drop fields that should never reach anonymous browsers. `meeting_url`
 * is the join link for virtual events — it's surfaced post-registration
 * (confirmation page + email) but not on the public event page.
 *
 * Admin POST/PUT responses skip this so the form can round-trip the value.
 */
function stripPrivateFields(event: Record<string, unknown>): Record<string, unknown> {
  const { meeting_url: _omit, ...rest } = event;
  void _omit;
  return rest;
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
