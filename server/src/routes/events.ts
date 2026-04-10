import { Router } from "express";
import multer from "multer";
import {
  EventInputSchema,
  EventListQuerySchema,
} from "@be-on-bsv/shared";
import { supabase } from "../services/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { HttpError, asyncHandler } from "../middleware/error.js";

export const eventsRouter: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── GET /api/events ──────────────────────────────────────────
eventsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = EventListQuerySchema.parse(req.query);
    const nowIso = new Date().toISOString();

    let q = supabase
      .from("events")
      .select("*")
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
    res.json({ events: data ?? [] });
  }),
);

// ── GET /api/events/:id ──────────────────────────────────────
eventsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, "event_not_found");
    res.json({ event: data });
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

    let coverUrl = input.cover_url ?? null;

    if (req.file) {
      coverUrl = await uploadCover(req.file);
    }

    const { data, error } = await supabase
      .from("events")
      .insert({ ...input, cover_url: coverUrl })
      .select("*")
      .single();

    if (error) throw new HttpError(500, error.message);
    res.status(201).json({ event: data });
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

    let coverUrl = input.cover_url ?? null;
    if (req.file) {
      coverUrl = await uploadCover(req.file);
    }

    const { data, error } = await supabase
      .from("events")
      .update({ ...input, cover_url: coverUrl })
      .eq("id", req.params.id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();

    if (error) throw new HttpError(500, error.message);
    if (!data) throw new HttpError(404, "event_not_found");
    res.json({ event: data });
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
