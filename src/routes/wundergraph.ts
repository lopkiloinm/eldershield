/**
 * WunderGraph BFF (Backend for Frontend) layer for ElderShield.
 *
 * WunderGraph federates multiple data sources into a single typed API.
 * This route exposes a simplified WunderGraph-style operations endpoint
 * that composes Ghost DB + Redis queue stats + GitHub cited.md into
 * unified responses — exactly the pattern WunderGraph is designed for.
 *
 * In a full WunderGraph setup, wundergraph.config.ts would define the
 * data sources and generate a type-safe client. Here we implement the
 * same composition pattern manually to demonstrate the architecture.
 *
 * WunderGraph docs: https://docs.wundergraph.com
 */

import { Router, Request, Response } from "express";
import { pool } from "../db";
import { scanQueue } from "../redis";
import { getCitedMd } from "../githubClient";

export const wunderRouter = Router();

// ─── GET /api/wg/dashboard ────────────────────────────────────────────────────
// Federated dashboard query — composes Ghost DB + Redis + GitHub in one call.
// This is the WunderGraph pattern: one endpoint, multiple upstream sources.

wunderRouter.get("/dashboard", async (_req: Request, res: Response): Promise<void> => {
  const [dbStats, queueStats, citedMdResult] = await Promise.allSettled([
    fetchDbStats(),
    fetchQueueStats(),
    fetchCitedMdStats(),
  ]);

  res.json({
    // Source 1: Ghost DB (Postgres)
    db: dbStats.status === "fulfilled" ? dbStats.value : { error: "unavailable" },
    // Source 2: Redis / BullMQ
    queue: queueStats.status === "fulfilled" ? queueStats.value : { error: "unavailable" },
    // Source 3: GitHub cited.md
    citedMd: citedMdResult.status === "fulfilled" ? citedMdResult.value : { error: "unavailable" },
    // Metadata
    generatedAt: new Date().toISOString(),
    sources: ["ghost-postgres", "redis-bullmq", "github-cited-md"],
  });
});

// ─── GET /api/wg/household/:id ────────────────────────────────────────────────
// Federated household view — joins messages + risk events from Ghost DB.

wunderRouter.get("/household/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [household, recentScans, messageCount] = await Promise.all([
      pool.query("SELECT id, label, created_at FROM households WHERE id = $1", [id]),
      pool.query(
        `SELECT re.id AS "jobId", ui.url, re.risk, re.explanation, re.created_at AS "createdAt"
         FROM risk_events re
         LEFT JOIN url_inspections ui ON ui.id = re.url_inspection_id
         WHERE re.household_id = $1
         ORDER BY re.created_at DESC LIMIT 10`,
        [id]
      ),
      pool.query("SELECT COUNT(*) AS count FROM messages WHERE household_id = $1", [id]),
    ]);

    if (household.rows.length === 0) {
      res.status(404).json({ error: "Household not found" });
      return;
    }

    res.json({
      household: household.rows[0],
      recentScans: recentScans.rows,
      messageCount: parseInt(messageCount.rows[0].count, 10),
      riskSummary: summarizeRisk(recentScans.rows as Array<{ risk: string }>),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchDbStats() {
  const [totals, riskBreakdown] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM households)      AS households,
        (SELECT COUNT(*) FROM messages)        AS messages,
        (SELECT COUNT(*) FROM url_inspections) AS inspections,
        (SELECT COUNT(*) FROM risk_events)     AS risk_events
    `),
    pool.query(`
      SELECT risk, COUNT(*) AS count
      FROM risk_events
      GROUP BY risk
      ORDER BY count DESC
    `),
  ]);

  return {
    source: "ghost-postgres",
    totals: totals.rows[0],
    riskBreakdown: riskBreakdown.rows,
  };
}

async function fetchQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    scanQueue.getWaitingCount(),
    scanQueue.getActiveCount(),
    scanQueue.getCompletedCount(),
    scanQueue.getFailedCount(),
  ]);
  return { source: "redis-bullmq", waiting, active, completed, failed };
}

async function fetchCitedMdStats() {
  const { content } = await getCitedMd();
  const entries = (content.match(/^## /gm) ?? []).length;
  const scams = (content.match(/🚨/g) ?? []).length;
  const suspicious = (content.match(/⚠️/g) ?? []).length;
  const safe = (content.match(/✅/g) ?? []).length;
  return { source: "github-cited-md", totalEntries: entries, scams, suspicious, safe };
}

function summarizeRisk(rows: Array<{ risk: string }>) {
  const counts: Record<string, number> = { SAFE: 0, SUSPICIOUS: 0, SCAM: 0 };
  for (const r of rows) counts[r.risk] = (counts[r.risk] ?? 0) + 1;
  return counts;
}
