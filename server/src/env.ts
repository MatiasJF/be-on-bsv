import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load .env from the monorepo root, regardless of where the server was
// invoked from (npm --workspace server run dev sets CWD to server/, but the
// .env we care about lives at the repo root).
//
//   dev:  server/src/env.ts → ../../.env
//   prod: server/dist/env.js → ../../.env
const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env") });

/**
 * Single source of truth for server environment variables.
 *
 * Validated once at startup. If anything required is missing the process
 * exits with a clear error rather than blowing up later in a request handler.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_JWT_SECRET: z.string().min(10),

  // BSV
  BSV_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  BSV_SERVER_PRIVATE_KEY: z.string().optional(),
  BSV_NETWORK: z.enum(["main", "test"]).default("main"),
  BSV_STORAGE_URL: z.string().url().default("https://storage.babbage.systems"),
  BSV_TICKET_BASKET: z.string().default("be-on-bsv-tickets"),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    "❌ Invalid environment variables:\n" +
      parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n"),
  );
  process.exit(1);
}

if (parsed.data.BSV_ENABLED && !parsed.data.BSV_SERVER_PRIVATE_KEY) {
  // eslint-disable-next-line no-console
  console.error("❌ BSV_ENABLED=true but BSV_SERVER_PRIVATE_KEY is missing.");
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
