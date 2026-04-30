import type {
  Event,
  EventInput,
  Registration,
  RegistrationInput,
  RegistrationResponse,
} from "@be-on-bsv/shared";
import { getAccessToken } from "./supabase.js";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

/** Server-issued attendee certificate (signed JSON, off-chain). */
export interface AttendeeCert {
  v: 1;
  schema: "be-on-bsv-attendee/v1";
  eventId: string;
  registrationId: string;
  eventTitle: string;
  name: string;
  emailHash: string;
  attendeeIdentityKey: string;
  issuerIdentityKey: string;
  issuedAt: string;
  serial: string;
  signature: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { admin?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init.admin) {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, "not_signed_in");
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Public ──

export const api = {
  events: {
    list: (status: "upcoming" | "past" = "upcoming") =>
      request<{ events: Event[] }>(`/events?status=${status}`),
    get: (id: string) => request<{ event: Event }>(`/events/${id}`),
  },

  register: (input: RegistrationInput) =>
    request<RegistrationResponse>("/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  registration: (id: string) =>
    request<{
      registration: Registration;
      event: {
        title: string;
        starts_at: string;
        ends_at: string | null;
        location: string | null;
        is_virtual: boolean;
        meeting_url: string | null;
        cover_url: string | null;
      } | null;
      whats_on_chain_url: string | null;
      ord_whats_on_chain_url: string | null;
      reward_whats_on_chain_url: string | null;
      reward_sats_config: number;
      ticket_svg_url: string;
    }>(`/register/${id}`),

  // ── Attendee cert (public confirmation page) ──
  cert: {
    challenge: (registrationId: string) =>
      request<{ nonce: string; expiresAt: string }>(
        `/register/${registrationId}/cert-challenge`,
      ),
    issue: (
      registrationId: string,
      body: { identityKey: string; nonce: string; signature: string },
    ) =>
      request<{ cert: AttendeeCert }>(`/register/${registrationId}/issue-cert`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    claimChallenge: (registrationId: string) =>
      request<{ nonce: string; expiresAt: string }>(
        `/register/${registrationId}/claim-reward-challenge`,
      ),
    claimReward: (
      registrationId: string,
      body: { identityKey: string; nonce: string; signature: string },
    ) =>
      request<{ reward: { txid: string; sats: number; claimed_at: string } }>(
        `/register/${registrationId}/claim-reward`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },

  // ── Admin ──
  admin: {
    /**
     * Same shape as `api.events.get` but signed with the admin JWT, so
     * the server returns private fields (e.g. `meeting_url`) that are
     * stripped from anonymous responses.
     */
    getEvent: (id: string) =>
      request<{ event: Event }>(`/events/${id}`, { admin: true }),

    createEvent: (input: EventInput, cover?: File) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(input)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          fd.append(k, JSON.stringify(v));
        } else {
          fd.append(k, String(v));
        }
      }
      if (cover) fd.append("cover", cover);
      return request<{ event: Event }>("/events", { method: "POST", body: fd, admin: true });
    },

    updateEvent: (id: string, input: EventInput, cover?: File) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(input)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          fd.append(k, JSON.stringify(v));
        } else {
          fd.append(k, String(v));
        }
      }
      if (cover) fd.append("cover", cover);
      return request<{ event: Event }>(`/events/${id}`, { method: "PUT", body: fd, admin: true });
    },

    deleteEvent: (id: string) =>
      request<void>(`/events/${id}`, { method: "DELETE", admin: true }),

    listRegistrations: (eventId: string) =>
      request<{ registrations: Registration[] }>(`/registrations/${eventId}`, { admin: true }),

    deleteRegistration: (registrationId: string) =>
      request<void>(`/admin/registrations/${registrationId}`, {
        method: "DELETE",
        admin: true,
      }),

    exportUrl: (eventId: string) => `${BASE}/export/${eventId}`,
  },
};
