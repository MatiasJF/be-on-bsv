import type {
  Event,
  EventInput,
  Registration,
  RegistrationInput,
  RegistrationResponse,
} from "@be-on-bsv/shared";
import { getAccessToken } from "./supabase.js";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

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
      event: { title: string; starts_at: string; location: string | null; is_virtual: boolean; cover_url: string | null } | null;
      whats_on_chain_url: string | null;
    }>(`/register/${id}`),

  // ── Admin ──
  admin: {
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

    exportUrl: (eventId: string) => `${BASE}/export/${eventId}`,
  },
};
