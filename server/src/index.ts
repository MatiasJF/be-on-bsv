import { fileURLToPath } from "node:url";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { env } from "./env.js";
import { eventsRouter } from "./routes/events.js";
import { registrationsRouter } from "./routes/registrations.js";
import { exportsRouter } from "./routes/exports.js";
import { errorHandler } from "./middleware/error.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// CORS for dev — in prod the client is served by this same server so no CORS.
if (env.NODE_ENV !== "production") {
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (_req.method === "OPTIONS") {
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
app.use("/api", exportsRouter); // mounts /export/:id

// ── Static client (production only) ──
if (env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js → ../../client/dist
  const clientDist = path.resolve(__dirname, "../../client/dist");

  app.use(express.static(clientDist));

  // SPA fallback — anything not under /api gets the React app.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// ── Errors ──
app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[be-on-bsv] server listening on http://localhost:${env.PORT}  (env=${env.NODE_ENV}, bsv=${env.BSV_ENABLED ? "live" : "stub"})`,
  );
});
