// ElderShield – Autonomous Scam-Protection Agent
//
// Architecture notes:
//   - Ghost.build Postgres: primary memory and audit log (DATABASE_URL)
//   - Redis / BullMQ: real-time job queue for scan jobs
//   - TinyFish: remote browser agent for live URL analysis
//   - Nexla Tools API: inbox Nexset for autonomous message sweep
//   - GitHub REST API: publishes results to cited.md
//   - x402 payment rails: enforced on /api/inbox-sweep
//
// WunderGraph TODO: wrap this Express backend with a WunderGraph BFF for
//   type-safe API composition and federation across Ghost, Nexla, and GitHub.
//
// Chainguard: use `cgr.dev/chainguard/node:latest` as the Docker base image
//   for a hardened, minimal container with no shell or package manager.

import express from "express";
import { config } from "./config";
import { dbHealthCheck } from "./db";
import { redisConnection } from "./redis";
import { scanRouter } from "./routes/scan";
import { workerRouter } from "./routes/worker";
import { voiceRouter } from "./routes/voice";

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: "1mb" }));

// Request logging
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/healthz", async (_req, res) => {
  const dbOk = await dbHealthCheck();
  const redisOk = redisConnection.status === "ready";

  res.status(dbOk && redisOk ? 200 : 503).json({
    ok: dbOk && redisOk,
    db: dbOk,
    redis: redisOk,
    version: "1.0.0",
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use("/api", scanRouter);
app.use("/api/worker", workerRouter);
app.use("/api/voice", voiceRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[server] Unhandled error:", msg);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`[server] ElderShield listening on port ${config.port}`);
  console.log(`[server] Ghost DB: ${config.databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`[server] Redis: ${config.redisUrl || `${config.redisHost}:${config.redisPort}`}`);
});

export default app;
