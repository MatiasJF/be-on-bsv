import type { NextFunction, Request, RequestHandler, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Async route wrapper — catches rejected promises and forwards to errorHandler.
 * Avoids needing try/catch in every route handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      details: err.details ?? undefined,
    });
    return;
  }

  if (err instanceof MulterError) {
    // Translate the most common multer codes to clear, actionable messages.
    const map: Record<string, { status: number; message: string }> = {
      LIMIT_FILE_SIZE: {
        status: 413,
        message: "cover image too large (max 10 MB)",
      },
      LIMIT_UNEXPECTED_FILE: {
        status: 400,
        message: `unexpected file field "${err.field ?? "?"}"`,
      },
      LIMIT_FILE_COUNT: { status: 400, message: "too many files" },
    };
    const mapped = map[err.code];
    res
      .status(mapped?.status ?? 400)
      .json({ error: mapped?.message ?? `upload_error: ${err.code}` });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled]", err);
  res.status(500).json({ error: "internal_server_error" });
}
