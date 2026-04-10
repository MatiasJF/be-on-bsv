import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Swap the real supabase service for the in-memory mock BEFORE the app loads.
vi.mock("../src/services/supabase.js", async () => {
  return await import("./mocks/supabase.js");
});

// Email service: silence the console fallback so test output stays clean.
vi.mock("../src/services/email.js", () => ({
  sendRegistrationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { setMockResult, resetMockState } from "./mocks/supabase.js";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  // Dynamic import so the env-mock + service-mocks above are in place first.
  const { createApp } = await import("../src/app.js");
  app = createApp();
});

afterEach(() => {
  resetMockState();
});

// ── /api/health ──────────────────────────────────────────────
describe("GET /api/health", () => {
  it("returns ok=true with env metadata", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, env: "test", bsv_enabled: false });
  });
});

// ── /api/events ──────────────────────────────────────────────
describe("GET /api/events", () => {
  it("returns the list of upcoming events", async () => {
    setMockResult("events.select", [sampleEvent("11111111-1111-1111-1111-111111111111", "Wallets 101")]);
    const res = await request(app).get("/api/events?status=upcoming");
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].title).toBe("Wallets 101");
  });

  it("returns an empty array when no events exist", async () => {
    setMockResult("events.select", []);
    const res = await request(app).get("/api/events?status=upcoming");
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });
});

describe("GET /api/events/:id", () => {
  it("returns 404 when the event isn't found", async () => {
    setMockResult("events.select", null);
    const res = await request(app).get("/api/events/22222222-2222-2222-2222-222222222222");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("event_not_found");
  });

  it("returns the event when it exists", async () => {
    setMockResult(
      "events.select",
      sampleEvent("33333333-3333-3333-3333-333333333333", "PushDrop Tickets"),
    );
    const res = await request(app).get("/api/events/33333333-3333-3333-3333-333333333333");
    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe("PushDrop Tickets");
  });
});

// ── /api/register ────────────────────────────────────────────
describe("POST /api/register", () => {
  const eventId = "44444444-4444-4444-4444-444444444444";
  const validBody = {
    event_id: eventId,
    name: "Ada Lovelace",
    email: "ada@example.com",
    organization: "Babbage Engines Ltd.",
  };

  it("registers successfully and returns a stub ticket", async () => {
    setMockResult("events.select", sampleEvent(eventId, "BSV Workshop"));
    setMockResult("registrations.insert", {
      id: "55555555-5555-5555-5555-555555555555",
      event_id: eventId,
      name: validBody.name,
      email: validBody.email,
      organization: validBody.organization,
      created_at: new Date().toISOString(),
      tx_id: null,
      outpoint: null,
    });
    setMockResult("registrations.update", { ok: true });

    const res = await request(app).post("/api/register").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.registration.email).toBe(validBody.email);
    expect(res.body.event_title).toBe("BSV Workshop");
    // BSV_ENABLED=false → stub ticket
    expect(res.body.ticket).not.toBeNull();
    expect(res.body.ticket.stub).toBe(true);
    expect(res.body.ticket.tx_id).toMatch(/^stub-/);
  });

  it("returns 409 on duplicate registration", async () => {
    setMockResult("events.select", sampleEvent(eventId, "BSV Workshop"));
    setMockResult("registrations.insert", null, {
      message: "duplicate key value violates unique constraint",
      code: "23505",
    });

    const res = await request(app).post("/api/register").send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("already_registered");
  });

  it("returns 404 when registering for a non-existent event", async () => {
    setMockResult("events.select", null);
    const res = await request(app).post("/api/register").send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("event_not_found");
  });

  it("returns 400 on invalid input", async () => {
    const res = await request(app).post("/api/register").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });
});

// ── Admin auth ───────────────────────────────────────────────
describe("admin routes require a valid bearer token", () => {
  it("GET /api/registrations/:id → 401 with no token", async () => {
    const res = await request(app).get(
      "/api/registrations/44444444-4444-4444-4444-444444444444",
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/export/:id → 401 with no token", async () => {
    const res = await request(app).get("/api/export/44444444-4444-4444-4444-444444444444");
    expect(res.status).toBe(401);
  });

  it("POST /api/events → 401 with no token", async () => {
    const res = await request(app).post("/api/events").send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /api/events/:id → 401 with no token", async () => {
    const res = await request(app).delete("/api/events/44444444-4444-4444-4444-444444444444");
    expect(res.status).toBe(401);
  });

  it("returns 403 with a valid token but no admin role", async () => {
    // The middleware delegates verification to supabase.auth.getUser; the
    // mock returns whatever user we configure regardless of token contents.
    setMockResult("auth.getUser", {
      user: {
        id: "user-123",
        email: "user@example.com",
        app_metadata: { role: "user" },
        user_metadata: {},
      },
    });

    const res = await request(app)
      .get("/api/registrations/44444444-4444-4444-4444-444444444444")
      .set("Authorization", "Bearer not-an-admin-token");
    expect(res.status).toBe(403);
  });

  it("succeeds with a valid admin token", async () => {
    setMockResult("auth.getUser", {
      user: {
        id: "admin-1",
        email: "admin@example.com",
        app_metadata: { role: "admin" },
        user_metadata: {},
      },
    });
    setMockResult("registrations.select", []);

    const res = await request(app)
      .get("/api/registrations/44444444-4444-4444-4444-444444444444")
      .set("Authorization", "Bearer fake-admin-token");
    expect(res.status).toBe(200);
    expect(res.body.registrations).toEqual([]);
  });

  it("returns 401 when supabase.auth.getUser rejects the token", async () => {
    setMockResult("auth.getUser", { user: null }, { message: "invalid JWT" });
    const res = await request(app)
      .get("/api/registrations/44444444-4444-4444-4444-444444444444")
      .set("Authorization", "Bearer expired-or-bogus");
    expect(res.status).toBe(401);
  });
});

// ── helpers ──────────────────────────────────────────────────
function sampleEvent(id: string, title: string) {
  const now = new Date().toISOString();
  return {
    id,
    title,
    description: "A sample event for tests.",
    starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    ends_at: null,
    location: "Online",
    is_virtual: true,
    cover_url: null,
    tags: ["test"],
    host_name: null,
    host_bio: null,
    host_avatar: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
