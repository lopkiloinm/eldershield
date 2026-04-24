import { Router, Request, Response } from "express";
import { pool } from "../db";
import { scanQueue } from "../redis";

export const metaRouter = Router();

// ─── GET /api/queue/stats ─────────────────────────────────────────────────────
// Returns BullMQ queue depth for the dashboard indicator.

metaRouter.get("/queue/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      scanQueue.getWaitingCount(),
      scanQueue.getActiveCount(),
      scanQueue.getCompletedCount(),
      scanQueue.getFailedCount(),
    ]);
    res.json({ waiting, active, completed, failed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── GET /api/scans/recent ────────────────────────────────────────────────────
// Returns the most recent risk_events from Ghost DB for the history tab.

metaRouter.get("/scans/recent", async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "20"), 10), 100);

  try {
    const result = await pool.query(
      `SELECT
         re.id          AS "jobId",
         ui.url,
         re.risk,
         re.explanation,
         re.created_at  AS "createdAt"
       FROM risk_events re
       LEFT JOIN url_inspections ui ON ui.id = re.url_inspection_id
       ORDER BY re.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
