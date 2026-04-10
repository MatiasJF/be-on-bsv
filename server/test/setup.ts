/**
 * Vitest setup file.
 *
 * Runs before any test file is imported. Sets the env vars that
 * `server/src/env.ts` validates at module load time, so tests don't need
 * a real Supabase project (they mock the supabase client instead).
 */

process.env.NODE_ENV = "test";
process.env.PORT = "3001"; // unused — tests never call listen() — just must satisfy the env schema (> 0)
process.env.PUBLIC_APP_URL = "http://localhost:5173";

process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_ANON_KEY = "test-anon-key-0123456789";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-0123456789";
process.env.SUPABASE_JWT_SECRET = "test-jwt-secret-0123456789-do-not-use-in-prod";

// BSV defaults to disabled → mintRegistrationTicket() returns a stub.
process.env.BSV_ENABLED = "false";

// Email defaults to console fallback.
delete process.env.RESEND_API_KEY;
