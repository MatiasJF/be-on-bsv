import type { NextFunction, Request, Response } from "express";
import { jwtVerify } from "jose";
import { env } from "../env.js";

declare module "express-serve-static-core" {
  interface Request {
    admin?: {
      userId: string;
      email: string | null;
    };
  }
}

const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

/**
 * Verifies a Supabase access token from the `Authorization: Bearer …` header
 * and asserts that the user has the `app_metadata.role = "admin"` claim.
 *
 * On success, attaches `req.admin = { userId, email }`.
 * On failure, responds with 401/403.
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

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    const role =
      (payload.app_metadata as { role?: string } | undefined)?.role ??
      (payload as { role?: string }).role;

    if (role !== "admin") {
      res.status(403).json({ error: "admin role required" });
      return;
    }

    req.admin = {
      userId: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : null,
    };
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid token";
    res.status(401).json({ error: msg });
  }
}
