import type { NextFunction, Request, Response } from "express";
import { supabase } from "../services/supabase.js";

declare module "express-serve-static-core" {
  interface Request {
    admin?: {
      userId: string;
      email: string | null;
    };
  }
}

/**
 * Verifies a Supabase access token from the `Authorization: Bearer …` header
 * and asserts that the user has the `app_metadata.role = "admin"` claim.
 *
 * On success, attaches `req.admin = { userId, email }`.
 * On failure, responds with 401/403.
 *
 * Token verification is delegated to `supabase.auth.getUser(token)` rather
 * than verified locally with a fixed algorithm. Supabase rolled out
 * asymmetric JWT signing (ES256/RS256) alongside the legacy HS256 secret as
 * part of the new API key system; letting supabase-js handle verification
 * means we transparently support both, and any future key-system changes,
 * without having to manage JWKS rotation in our middleware.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  const token = auth.slice(7).trim();

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: error?.message ?? "invalid token" });
    return;
  }

  const role =
    (data.user.app_metadata as { role?: string } | undefined)?.role ??
    (data.user.user_metadata as { role?: string } | undefined)?.role;

  if (role !== "admin") {
    res.status(403).json({ error: "admin role required" });
    return;
  }

  req.admin = {
    userId: data.user.id,
    email: data.user.email ?? null,
  };
  next();
}
