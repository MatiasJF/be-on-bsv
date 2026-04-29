import { z } from "zod";
import { EventSpeakerSchema } from "./speakers.js";

/**
 * An event in the BE on BSV series.
 *
 * `starts_at` is the source of truth for upcoming/past — derived at query time,
 * never persisted as a separate `is_past` flag.
 *
 * `speakers[]` is the new multi-speaker model (via the speakers +
 * event_speakers tables). The flat `host_*` fields are kept as legacy
 * read-side fallback for rows that haven't been migrated or that were
 * created by pre-003 writes. New writes should ignore `host_*` and use
 * `speakers`.
 */
export const EventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().nullable().optional(),
  is_virtual: z.boolean().default(false),
  /**
   * URL where registrants of a virtual event join (Zoom/Meet/Jitsi/etc.).
   * Only meaningful when `is_virtual = true`. Never exposed in public
   * listings — surfaced only post-registration on the confirmation page
   * and in the confirmation email.
   */
  meeting_url: z.string().url().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  tags: z.array(z.string()).default([]),
  /** @deprecated use `speakers[]`. Kept for legacy rows. */
  host_name: z.string().nullable().optional(),
  /** @deprecated use `speakers[]`. */
  host_bio: z.string().nullable().optional(),
  /** @deprecated use `speakers[]`. */
  host_avatar: z.string().url().nullable().optional(),
  /** 0..N speakers for this event, ordered by `position`. */
  speakers: z.array(EventSpeakerSchema).default([]),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Event = z.infer<typeof EventSchema>;

/**
 * Payload for `POST /api/events` and `PUT /api/events/:id`.
 *
 * `speakers[]` is the preferred way to attach hosts / panelists /
 * moderators. The flat `host_*` fields are still accepted for backward
 * compatibility (old admin forms) — the server synthesizes a single
 * speaker from them when `speakers` is empty/absent.
 */
export const EventInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  is_virtual: z.boolean().default(false),
  meeting_url: z.string().url().max(2000).nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  /** Up to 10 speakers per event. */
  speakers: z.array(EventSpeakerSchema).max(10).optional(),
  /** @deprecated prefer `speakers`. */
  host_name: z.string().max(120).nullable().optional(),
  /** @deprecated prefer `speakers`. */
  host_bio: z.string().max(1000).nullable().optional(),
  /** @deprecated prefer `speakers`. */
  host_avatar: z.string().url().nullable().optional(),
});

export type EventInput = z.infer<typeof EventInputSchema>;

export const EventListQuerySchema = z.object({
  status: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type EventListQuery = z.infer<typeof EventListQuerySchema>;
