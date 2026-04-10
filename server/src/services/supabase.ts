import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

/**
 * Service-role Supabase client. Bypasses RLS — server-only.
 * Never expose this client or its key to the browser.
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
