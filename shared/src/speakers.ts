import { z } from "zod";

/**
 * A speaker — a person who appears at one or more events. Reusable
 * across events via the `event_speakers` join table.
 */
export const SpeakerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  bio: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type Speaker = z.infer<typeof SpeakerSchema>;

/**
 * A speaker *as they appear on a specific event* — carries the per-event
 * role + position metadata alongside the speaker fields. This is the
 * shape the API returns in `event.speakers[]` and accepts on write.
 */
export const EventSpeakerSchema = z.object({
  // Optional on write — if omitted the server creates a new speakers row.
  // Populated on read from the speakers table.
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120).trim(),
  bio: z.string().max(1000).trim().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  /** e.g. "host", "panelist", "moderator". Defaults to "speaker". */
  role: z.string().min(1).max(40).default("speaker"),
  /** Display order. Lower = earlier. */
  position: z.number().int().min(0).default(0),
});

export type EventSpeaker = z.infer<typeof EventSpeakerSchema>;
