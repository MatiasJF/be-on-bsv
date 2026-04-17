import type { EventSpeaker } from "@be-on-bsv/shared";
import { supabase } from "../services/supabase.js";
import { HttpError } from "../middleware/error.js";

/**
 * Speaker-aware reads and writes for the events API.
 *
 * Read side: flattens Supabase's nested join shape into the `speakers[]`
 * array on the event, with a legacy fallback to the deprecated host_*
 * columns for rows that don't have any event_speakers yet.
 *
 * Write side: diff-replaces all event_speakers links for an event when
 * the caller provides an explicit `speakers` array. Omitted → existing
 * links are untouched (partial-update semantics).
 */

// The shape Supabase returns when we ask for
//   events.select("*, event_speakers(role, position, speakers(...))")
// Typed loose because the join column name is a literal string, not a
// well-known type at the row-type level.
interface RawJoinedEvent {
  [key: string]: unknown;
  host_name?: string | null;
  host_bio?: string | null;
  host_avatar?: string | null;
  event_speakers?: Array<{
    role: string;
    position: number;
    speakers: {
      id: string;
      name: string;
      bio: string | null;
      avatar_url: string | null;
    } | null;
  }> | null;
}

/** Columns needed to run the flatten. Use as `EVENTS_WITH_SPEAKERS_SELECT`. */
export const EVENTS_WITH_SPEAKERS_SELECT =
  "*, event_speakers(role, position, speakers(id, name, bio, avatar_url))";

/**
 * Postgrest error codes that indicate the speakers/event_speakers table
 * hasn't been created yet (003_speakers.sql wasn't applied). Used to
 * gracefully fall back to a speakers-less query during the brief window
 * between deploying the new code and running the migration.
 */
const MISSING_TABLE_CODES = new Set([
  "PGRST205", // "Could not find the table in the schema cache"
  "42P01",    // Postgres "undefined_table"
]);

export function isMissingSpeakersTable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (typeof code === "string" && MISSING_TABLE_CODES.has(code)) return true;
  if (typeof message === "string" && /event_speakers|speakers/.test(message)) {
    if (/schema cache|does not exist/i.test(message)) return true;
  }
  return false;
}

/**
 * Convert the nested Supabase shape into the flat `speakers[]` the
 * API returns. Preserves the original event columns; deletes the
 * nested `event_speakers` key.
 */
export function flattenEventSpeakers(raw: RawJoinedEvent): Record<string, unknown> {
  const { event_speakers, ...rest } = raw;

  const joined = event_speakers ?? [];
  const speakers: EventSpeaker[] = joined
    .filter((row) => row.speakers !== null)
    .map((row) => ({
      id: row.speakers!.id,
      name: row.speakers!.name,
      bio: row.speakers!.bio,
      avatar_url: row.speakers!.avatar_url,
      role: row.role,
      position: row.position,
    }))
    .sort((a, b) => a.position - b.position);

  // Legacy fallback: no event_speakers rows yet but a host_name is
  // populated — synthesize a single-element speakers array from the
  // deprecated host_* columns so the client never needs to know.
  const final =
    speakers.length === 0 && typeof rest.host_name === "string" && rest.host_name.trim().length > 0
      ? [
          {
            name: rest.host_name!.trim(),
            bio: (rest.host_bio as string | null | undefined) ?? null,
            avatar_url: (rest.host_avatar as string | null | undefined) ?? null,
            role: "host",
            position: 0,
          },
        ]
      : speakers;

  return { ...rest, speakers: final };
}

/**
 * Sync the event_speakers links for one event to exactly match the
 * given array. Clears the previous set and inserts the new one in
 * position order. Creates new `speakers` rows when input rows don't
 * have an `id`.
 *
 * Called from POST and PUT when `speakers` is in the payload. When
 * `speakers` is undefined the caller should skip calling this entirely
 * (partial-update semantics — leave existing links alone).
 */
export async function syncEventSpeakers(
  eventId: string,
  speakers: EventSpeaker[],
): Promise<void> {
  // 1. Wipe existing links for this event. The `speakers` rows are
  //    preserved so they can be reused later; only the join rows go.
  const { error: delErr } = await supabase
    .from("event_speakers")
    .delete()
    .eq("event_id", eventId);
  if (delErr) {
    // Bubble up with the original code intact so callers can detect
    // missing-table errors via isMissingSpeakersTable().
    const err = new HttpError(500, `speakers unlink: ${delErr.message}`);
    (err as unknown as { code?: string }).code = delErr.code;
    throw err;
  }

  if (speakers.length === 0) return;

  // 2. For each incoming speaker row:
  //    - If it has an `id`, reuse that speakers row.
  //    - Otherwise insert a new speakers row and capture its id.
  const resolved: Array<{ speaker_id: string; role: string; position: number }> = [];

  for (let i = 0; i < speakers.length; i++) {
    const sp = speakers[i]!;

    let speakerId = sp.id;
    if (!speakerId) {
      const { data, error } = await supabase
        .from("speakers")
        .insert({
          name: sp.name.trim(),
          bio: sp.bio?.toString().trim() || null,
          avatar_url: sp.avatar_url ?? null,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new HttpError(500, `speaker insert: ${error?.message ?? "unknown"}`);
      }
      speakerId = data.id;
    } else {
      // Update the existing speaker's fields so edits land.
      const { error } = await supabase
        .from("speakers")
        .update({
          name: sp.name.trim(),
          bio: sp.bio?.toString().trim() || null,
          avatar_url: sp.avatar_url ?? null,
        })
        .eq("id", speakerId);
      if (error) throw new HttpError(500, `speaker update: ${error.message}`);
    }

    if (!speakerId) {
      // unreachable — both branches above set it or throw — but narrow for TS.
      throw new HttpError(500, "speaker id resolution failed");
    }
    resolved.push({
      speaker_id: speakerId,
      role: sp.role,
      position: typeof sp.position === "number" ? sp.position : i,
    });
  }

  // 3. Insert all new links in one statement.
  const rows = resolved.map((r) => ({
    event_id: eventId,
    speaker_id: r.speaker_id,
    role: r.role,
    position: r.position,
  }));
  const { error: insErr } = await supabase.from("event_speakers").insert(rows);
  if (insErr) throw new HttpError(500, `speakers link: ${insErr.message}`);
}
