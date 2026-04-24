import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { enqueueScanJob } from "../redis";
import type { ScanJob } from "../models";

export const voiceRouter = Router();

const URL_REGEX = /https?:\/\/[^\s"'<>]+/gi;

// ─── POST /api/voice/scan-message ─────────────────────────────────────────────
//
// Voice-friendly endpoint. Accepts a spoken transcript, extracts URLs,
// enqueues scan jobs, and returns a short spoken-friendly response.
//
// Example voice agent usage:
//   User says: "Can you check this link for me? https://free-prize.win/claim"
//   Body: { "transcript": "Can you check this link for me? https://free-prize.win/claim" }
//   Response: { "message": "I've queued a scan for free-prize.win. You'll get a result shortly." }

voiceRouter.post("/scan-message", async (req: Request, res: Response): Promise<void> => {
  const { transcript, householdId } = req.body as {
    transcript?: unknown;
    householdId?: unknown;
  };

  if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
    res.status(400).json({ error: "transcript is required and must be a non-empty string" });
    return;
  }

  const safeHouseholdId = typeof householdId === "string" ? householdId : undefined;

  try {
    const hid = await ensureHousehold(safeHouseholdId);

    // Extract URLs from transcript
    const urls = transcript.match(URL_REGEX) ?? [];

    if (urls.length === 0) {
      // No URL found – treat the whole transcript as a message to scan for keywords
      const messageId = await insertMessage(hid, "manual", transcript);
      const jobId = uuidv4();

      // Use a placeholder URL derived from any domain-like text, or a sentinel
      const syntheticUrl = extractDomainLikeText(transcript) ?? "https://eldershield.invalid/text-only";

      const job: ScanJob = {
        jobId,
        householdId: hid,
        url: syntheticUrl,
        messageText: transcript,
        messageId,
      };

      await enqueueScanJob(job);

      res.status(202).json({
        jobId,
        message:
          "I didn't find a specific link in your message, but I've queued a scan of the text for suspicious content. You'll get a result shortly.",
        urlsFound: 0,
      });
      return;
    }

    // Enqueue one job per URL
    const jobIds: string[] = [];

    for (const url of urls) {
      try {
        new URL(url); // validate
      } catch {
        continue;
      }

      const messageId = await insertMessage(hid, "manual", transcript);
      const jobId = uuidv4();

      const job: ScanJob = {
        jobId,
        householdId: hid,
        url,
        messageText: transcript,
        messageId,
      };

      await enqueueScanJob(job);
      jobIds.push(jobId);
    }

    if (jobIds.length === 0) {
      res.status(400).json({ error: "No valid URLs found in transcript" });
      return;
    }

    const domains = urls
      .slice(0, 3)
      .map((u) => {
        try {
          return new URL(u).hostname;
        } catch {
          return u;
        }
      })
      .join(", ");

    const plural = jobIds.length > 1 ? `${jobIds.length} links` : "this link";

    res.status(202).json({
      jobIds,
      message: `I've queued a scan for ${plural} — ${domains}. You'll get a result shortly. If anything looks suspicious, I'll let you know right away.`,
      urlsFound: urls.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[voice] Error:", msg);
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

function extractDomainLikeText(text: string): string | undefined {
  // Try to find something that looks like a domain (e.g. "free-prize.win")
  const domainPattern = /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)\b/g;
  const matches = text.match(domainPattern);
  if (matches && matches.length > 0) {
    return `https://${matches[0]}`;
  }
  return undefined;
}
