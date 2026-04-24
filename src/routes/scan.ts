import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { enqueueScanJob } from "../redis";
import { fetchInboxMessages } from "../nexlaClient";
import { config } from "../config";
import type { ScanJob } from "../models";

export const scanRouter = Router();

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;

// ─── POST /api/scan-url ───────────────────────────────────────────────────────

scanRouter.post("/scan-url", async (req: Request, res: Response): Promise<void> => {
  const { url, messageText, householdId } = req.body as {
    url?: unknown;
    messageText?: unknown;
    householdId?: unknown;
  };

  // Validate URL
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required and must be a string" });
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only http/https URLs are supported");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid URL";
    res.status(400).json({ error: `Invalid URL: ${msg}` });
    return;
  }

  const safeMessageText = typeof messageText === "string" ? messageText : undefined;
  const safeHouseholdId = typeof householdId === "string" ? householdId : undefined;

  try {
    // Ensure household exists
    const hid = await ensureHousehold(safeHouseholdId);

    // Persist message if text provided
    let messageId: string | undefined;
    if (safeMessageText) {
      messageId = await insertMessage(hid, "manual", safeMessageText);
    }

    // Enqueue scan job
    const jobId = uuidv4();
    const job: ScanJob = {
      jobId,
      householdId: hid,
      url: parsedUrl.toString(),
      messageText: safeMessageText,
      messageId,
    };

    await enqueueScanJob(job);

    res.status(202).json({ jobId, householdId: hid });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scan-url] Error:", msg);
    res.status(500).json({ error: "Internal server error", detail: msg });
  }
});

// ─── GET /api/scan-result/:jobId ──────────────────────────────────────────────

scanRouter.get("/scan-result/:jobId", async (req: Request, res: Response): Promise<void> => {
  const { jobId } = req.params;

  if (!jobId || typeof jobId !== "string") {
    res.status(400).json({ error: "jobId is required" });
    return;
  }

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
       WHERE re.id = $1
       LIMIT 1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      res.status(200).json({ status: "pending", jobId });
      return;
    }

    res.status(200).json(result.rows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scan-result] Error:", msg);
    res.status(500).json({ error: "Internal server error", detail: msg });
  }
});

// ─── POST /api/inbox-sweep ────────────────────────────────────────────────────

scanRouter.post("/inbox-sweep", async (req: Request, res: Response): Promise<void> => {
  // x402-style payment enforcement
  const paymentToken = req.headers["x-payment-token"];
  if (!paymentToken) {
    res.status(402).json({
      error: "payment_required",
      hint: "Attach X-Payment-Token header to enable bulk inbox sweep",
    });
    return;
  }

  // Simple token validation: accept any non-empty token in demo mode,
  // or match against PAYMENT_TOKEN_SECRET if set.
  const tokenValid =
    config.paymentTokenSecret === "demo-token" ||
    paymentToken === config.paymentTokenSecret;

  if (!tokenValid) {
    res.status(402).json({
      error: "payment_required",
      hint: "Invalid X-Payment-Token",
    });
    return;
  }

  const { householdId } = req.body as { householdId?: unknown };
  const safeHouseholdId = typeof householdId === "string" ? householdId : undefined;

  try {
    const hid = await ensureHousehold(safeHouseholdId);

    // Fetch messages from Nexla inbox Nexset
    let messages: Awaited<ReturnType<typeof fetchInboxMessages>>;
    try {
      messages = await fetchInboxMessages();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[inbox-sweep] Nexla fetch failed:", msg);
      res.status(502).json({ error: "Failed to fetch inbox messages", detail: msg });
      return;
    }

    let enqueued = 0;

    for (const msg of messages) {
      const urlToScan = msg.url ?? extractFirstUrl(msg.text);
      if (!urlToScan) continue;

      try {
        new URL(urlToScan); // validate
      } catch {
        continue;
      }

      const messageId = await insertMessage(hid, "inbox", msg.text);
      const jobId = uuidv4();

      const job: ScanJob = {
        jobId,
        householdId: hid,
        url: urlToScan,
        messageText: msg.text,
        messageId,
      };

      await enqueueScanJob(job);
      enqueued++;
    }

    res.status(200).json({ enqueued, householdId: hid });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[inbox-sweep] Error:", msg);
    res.status(500).json({ error: "Internal server error", detail: msg });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureHousehold(householdId?: string): Promise<string> {
  if (householdId) {
    const existing = await pool.query(
      "SELECT id FROM households WHERE id = $1",
      [householdId]
    );
    if (existing.rows.length > 0) return householdId;
  }

  // Create a default household
  const result = await pool.query(
    "INSERT INTO households (label) VALUES ($1) RETURNING id",
    [householdId ? `Household ${householdId}` : "Demo Household"]
  );
  return result.rows[0].id as string;
}

async function insertMessage(
  householdId: string,
  source: "manual" | "inbox",
  rawText: string
): Promise<string> {
  const result = await pool.query(
    "INSERT INTO messages (household_id, source, raw_text) VALUES ($1, $2, $3) RETURNING id",
    [householdId, source, rawText]
  );
  return result.rows[0].id as string;
}

function extractFirstUrl(text: string): string | undefined {
  const matches = text.match(URL_REGEX);
  return matches ? matches[0] : undefined;
}
