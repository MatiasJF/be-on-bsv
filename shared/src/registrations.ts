import { z } from "zod";

export const RegistrationSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string().uuid(),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  organization: z.string().max(200).nullable().optional(),
  tx_id: z.string().nullable().optional(),
  outpoint: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }),
});

export type Registration = z.infer<typeof RegistrationSchema>;

/** Payload for `POST /api/register`. */
export const RegistrationInputSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().min(1).max(120).trim(),
  email: z.string().email().toLowerCase().trim(),
  organization: z.string().max(200).trim().optional().nullable(),
});

export type RegistrationInput = z.infer<typeof RegistrationInputSchema>;

/** Response from `POST /api/register`. */
export const RegistrationResponseSchema = z.object({
  registration: RegistrationSchema,
  event_title: z.string(),
  ticket: z
    .object({
      tx_id: z.string(),
      outpoint: z.string(),
      stub: z.boolean(),
    })
    .nullable(),
});

export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;
