import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { scanQueue } from "../redis";
import { analyzePageWithTinyFish } from "../tinyfishClient";
import { classifyRisk } from "../risk";
import { appendToCitedMd } from "../githubClient";
import {
  setWorkingMemory,
  buildMemoryContext,
  promoteScanToLongTermMemory,
} from "../memoryClient";
import type { ScanJob } from "../models";

export const workerRouter = Router();

// ─── POST /api/worker/scan-next ───────────────────────────────────────────────
//
// Pull-based worker endpoint. Call this from:
//   - A local cron job:  */30 * * * * curl -X POST http://localhost:3000/api/worker/scan-next
//   - An Akash container running the same image with a cron loop
//
// Memory flow per job:
//   1. Write TinyFish output → Redis working memory (session context)
//   2. Recall similar past scams from Redis long-term memory (semantic search)
//   3. Inject recalled context into risk classifier
//   4. Promote confirmed findings → Redis long-term memory (shared + per-household)
//   5. Persist to Ghost Postgres (audit log)
//   6. Publish to cited.md via GitHub

workerRouter.post("/scan-next", async (_req: Request, res: Response): Promise<void> => {
  const waiting = await scanQueue.getJobs(["waiting"], 0, 0);

  if (waiting.length === 0) {
    res.status(204).send();
    return;
  }

  const job = waiting[0];
  const scanJob = job.data as ScanJob;
  // Use jobId as the memory session ID so working memory is tied to this scan
  const sessionId = scanJob.jobId;

  console.log(`[worker] Processing job ${scanJob.jobId} for URL: ${scanJob.url}`);

  try {
    // ── 1. TinyFish: open URL in remote browser ──────────────────────────────
    const pageAnalysis = await analyzePageWithTinyFish(scanJob.url);

    // ── 2. Write to Redis working memory ─────────────────────────────────────
    // Store the current scan context so the classifier can reference it and
    // the memory server can auto-summarize if the session grows large.
    try {
      await setWorkingMemory(
        sessionId,
        scanJob.householdId,
        pageAnalysis,
        scanJob.messageText
      );
    } catch (memErr: unknown) {
      // Memory is non-fatal — log and continue
      console.warn(`[worker] Working memory write failed (non-fatal): ${String(memErr)}`);
    }

    // ── 3. Recall similar past scams from Redis long-term memory ─────────────
    // This is the "have we seen this before?" step — semantic search over
    // the shared scam pattern library and this household's history.
    let memoryContext = "";
    try {
      memoryContext = await buildMemoryContext(
        scanJob.url,
        pageAnalysis.domain,
        scanJob.householdId,
        sessionId
      );
      if (memoryContext) {
        console.log(`[worker] Memory context retrieved (${memoryContext.length} chars)`);
      }
    } catch (memErr: unknown) {
      console.warn(`[worker] Memory recall failed (non-fatal): ${String(memErr)}`);
    }

    // ── 4. Classify risk (memory-augmented) ──────────────────────────────────
    // Pass recalled memory context so the classifier can factor in past patterns.
    const classification = classifyRisk(pageAnalysis, scanJob.messageText, memoryContext);

    console.log(`[worker] Job ${scanJob.jobId} → ${classification.risk}`);

    // ── 5. Promote to Redis long-term memory ─────────────────────────────────
    // SCAM and SUSPICIOUS findings become part of the shared scam library
    // and this household's episodic history — searchable by future scans.
    try {
      await promoteScanToLongTermMemory(
        sessionId,
        scanJob.householdId,
        pageAnalysis,
        classification,
        scanJob.messageText
      );
    } catch (memErr: unknown) {
      console.warn(`[worker] Long-term memory promotion failed (non-fatal): ${String(memErr)}`);
    }

    // ── 6. Persist to Ghost Postgres (audit log) ─────────────────────────────
    const inspectionId = uuidv4();
    await pool.query(
      `INSERT INTO url_inspections
         (id, message_id, url, domain, tinyfish_run_id, raw_page_summary)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        inspectionId,
        scanJob.messageId ?? null,
        scanJob.url,
        pageAnalysis.domain ?? null,
        extractRunId(pageAnalysis.raw),
        JSON.stringify(pageAnalysis.raw),
      ]
    );

    await pool.query(
      `INSERT INTO risk_events
         (id, household_id, url_inspection_id, risk, explanation)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        scanJob.jobId,
        scanJob.householdId,
        inspectionId,
        classification.risk,
        classification.explanation,
      ]
    );

    // ── 7. Publish to cited.md via GitHub ────────────────────────────────────
    const mdEntry = buildMarkdownEntry(scanJob, pageAnalysis, classification, memoryContext);
    try {
      await appendToCitedMd(mdEntry);
    } catch (ghErr: unknown) {
      console.error(`[worker] GitHub cited.md update failed (non-fatal): ${String(ghErr)}`);
    }

    // ── 8. Mark job complete ─────────────────────────────────────────────────
    await job.updateProgress(100);
    await scanQueue.remove(job.id!);

    res.status(200).json({
      jobId: scanJob.jobId,
      risk: classification.risk,
      explanation: classification.explanation,
      memoryContextUsed: memoryContext.length > 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Job ${scanJob.jobId} failed: ${msg}`);

    try {
      await job.moveToFailed(err instanceof Error ? err : new Error(msg), "0");
    } catch {
      // ignore
    }

    res.status(500).json({ error: "Worker processing failed", detail: msg });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractRunId(raw: unknown): string | null {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r["run_id"] === "string") return r["run_id"];
    if (typeof r["id"] === "string") return r["id"];
  }
  return null;
}

function buildMarkdownEntry(
  job: ScanJob,
  page: { url: string; domain?: string; suspiciousSignals: string[] },
  classification: { risk: string; explanation: string },
  memoryContext: string
): string {
  const now = new Date().toISOString();
  const riskEmoji =
    classification.risk === "SCAM" ? "🚨" : classification.risk === "SUSPICIOUS" ? "⚠️" : "✅";

  const lines = [
    `## ${riskEmoji} ${classification.risk} — ${page.url}`,
    ``,
    `- **Job ID**: \`${job.jobId}\``,
    `- **Scanned at**: ${now}`,
    `- **Domain**: ${page.domain ?? "unknown"}`,
    `- **Household**: ${job.householdId}`,
    `- **Signals**: ${page.suspiciousSignals.length > 0 ? page.suspiciousSignals.join(", ") : "none"}`,
    ``,
    `**Assessment**: ${classification.explanation}`,
  ];

  if (memoryContext) {
    lines.push(``, `**Memory context used**: yes — recalled similar past patterns from Redis Agent Memory.`);
  }

  lines.push(``, `---`, ``);
  return lines.join("\n");
}
