import { z } from "zod";

/**
 * An event in the BE on BSV series.
 *
 * `starts_at` is the source of truth for upcoming/past — derived at query time,
 * never persisted as a separate `is_past` flag.
 */
export const EventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().nullable().optional(),
  is_virtual: z.boolean().default(false),
  cover_url: z.string().url().nullable().optional(),
  tags: z.array(z.string()).default([]),
  host_name: z.string().nullable().optional(),
  host_bio: z.string().nullable().optional(),
  host_avatar: z.string().url().nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Event = z.infer<typeof EventSchema>;

/** Payload for `POST /api/events` and `PUT /api/events/:id`. */
export const EventInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  is_virtual: z.boolean().default(false),
  cover_url: z.string().url().nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  host_name: z.string().max(120).nullable().optional(),
  host_bio: z.string().max(1000).nullable().optional(),
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
