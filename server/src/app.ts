import { fileURLToPath } from "node:url";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";
import { env } from "./env.js";
import { eventsRouter } from "./routes/events.js";
import { registrationsRouter } from "./routes/registrations.js";
import { exportsRouter } from "./routes/exports.js";
import { adminRouter } from "./routes/admin.js";
import { certsRouter } from "./routes/certs.js";
import { errorHandler } from "./middleware/error.js";

/**
 * Build the Express app.
 *
 * Split out from `index.ts` so tests can import the configured app without
 * binding a port via `listen()`.
 */
export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  // CORS for dev — in prod the client is served by this same server.
  if (env.NODE_ENV !== "production") {
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });
  }

  // ── API ──
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, env: env.NODE_ENV, bsv_enabled: env.BSV_ENABLED });
  });

  app.use("/api/events", eventsRouter);
  app.use("/api", registrationsRouter); // mounts /register, /register/:id, /registrations/:id
  app.use("/api", certsRouter); // mounts /register/:id/cert-challenge, /register/:id/issue-cert
  app.use("/api", exportsRouter); // mounts /export/:id
  app.use("/api/admin", adminRouter); // mounts /wallet/info, /wallet/funding-request

  // ── Static client (production only) ──
  if (env.NODE_ENV === "production") {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // dist/index.js → ../../client/dist
    const clientDist = path.resolve(__dirname, "../../client/dist");

    // Log the resolved path on boot so prod deploys surface any
    // CWD/path weirdness immediately instead of making us guess why
    // /assets/*.css is 404ing.
    // eslint-disable-next-line no-console
    console.log(`[be-on-bsv] serving static client from ${clientDist}`);

    app.use(
      express.static(clientDist, {
        // Per-file Cache-Control: hashed bundles are immutable so they get
        // a 1-year cache; index.html must always be re-fetched so users
        // don't end up with a stale entry that references a chunk that
        // was replaced by the latest deploy ("Failed to fetch dynamically
        // imported module" on /assets/browser-<old-hash>.js).
        setHeaders: (res, filePath) => {
          const lower = filePath.toLowerCase();
          if (lower.endsWith("/index.html") || lower.endsWith(`${path.sep}index.html`)) {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
          } else if (lower.includes(`${path.sep}assets${path.sep}`) || lower.includes("/assets/")) {
            // Vite/Rollup outputs hashed filenames here — safe to long-cache.
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else if (lower.includes(`${path.sep}fonts${path.sep}`) || lower.includes("/fonts/")) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else {
            res.setHeader("Cache-Control", "public, max-age=3600");
          }
        },
      }),
    );

    // SPA catch-all for HTML navigations. Crucially, paths that look
    // like files (contain a dot) get a proper 404 here instead of the
    // HTML shell — otherwise express.static's fallthrough would hand
    // them to this handler and the browser would silently reject a
    // text/html response for /assets/*.css, /fonts/*.otf, etc., and
    // the site would render completely unstyled.
    app.get(/^(?!\/api\/).*/, (req, res) => {
      if (req.path.includes(".")) {
        res.status(404).json({ error: "not_found", path: req.path });
        return;
      }
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // ── Errors ──
  app.use(errorHandler);

  return app;
}
