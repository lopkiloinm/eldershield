/**
 * Vapi voice AI integration for ElderShield.
 *
 * Vapi calls this webhook during a voice call when the assistant needs to
 * perform a tool call (scan a URL or check a message for scams).
 *
 * Setup in Vapi dashboard:
 *   1. Create an assistant with system prompt (see VAPI_SYSTEM_PROMPT below)
 *   2. Add a "Server URL" tool pointing to POST /api/vapi/tool-call
 *   3. Define two functions: scan_url and check_message
 *   4. Set VAPI_API_KEY in .env
 *
 * Vapi docs: https://docs.vapi.ai/tools/server-url
 */

import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db";
import { enqueueScanJob } from "../redis";
import { analyzePageWithTinyFish } from "../tinyfishClient";
import { classifyRisk } from "../risk";
import type { ScanJob } from "../models";

export const vapiRouter = Router();

export const VAPI_SYSTEM_PROMPT = `
You are ElderShield, a friendly scam-protection assistant for older adults.
Your job is to help users identify suspicious links and messages.

When a user mentions a URL or link, call the scan_url function immediately.
When a user describes a suspicious message without a URL, call the check_message function.

Always respond in simple, clear language. If something is a SCAM, be direct and firm:
"This is a scam. Do not click that link or provide any personal information."

If something is SUSPICIOUS, say: "This looks suspicious. I'd recommend not clicking it."
If something is SAFE, say: "This looks safe, but always be careful online."
`.trim();

// ─── POST /api/vapi/tool-call ─────────────────────────────────────────────────
// Vapi calls this when the assistant invokes a tool during a voice call.

vapiRouter.post("/tool-call", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as VapiToolCallBody;

  // Validate Vapi secret if configured
  const vapiSecret = process.env["VAPI_WEBHOOK_SECRET"];
  if (vapiSecret) {
    const provided = req.headers["x-vapi-secret"];
    if (provided !== vapiSecret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const toolCall = body?.message?.toolCalls?.[0];
  if (!toolCall) {
    res.status(400).json({ error: "No tool call in request" });
    return;
  }

  const fnName = toolCall.function?.name;
  const args = toolCall.function?.arguments ?? {};

  console.log(`[vapi] Tool call: ${fnName}`, args);

  try {
    let result: string;

    if (fnName === "scan_url") {
      result = await handleScanUrl(args.url as string, args.message as string | undefined);
    } else if (fnName === "check_message") {
      result = await handleCheckMessage(args.message as string);
    } else {
      result = "I don't know how to handle that request.";
    }

    // Vapi expects { results: [{ toolCallId, result }] }
    res.json({
      results: [{ toolCallId: toolCall.id, result }],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vapi] Tool call error: ${msg}`);
    res.json({
      results: [{
        toolCallId: toolCall.id,
        result: "I ran into a problem checking that. Please try again.",
      }],
    });
  }
});

// ─── GET /api/vapi/assistant-config ──────────────────────────────────────────
// Returns the Vapi assistant configuration — paste into Vapi dashboard or
// use with the Vapi API to create/update the assistant programmatically.

vapiRouter.get("/assistant-config", (_req: Request, res: Response): void => {
  res.json({
    name: "ElderShield Voice Agent",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: VAPI_SYSTEM_PROMPT,
    },
    voice: {
      provider: "11labs",
      voiceId: "rachel",
    },
    tools: [
      {
        type: "function",
        function: {
          name: "scan_url",
          description: "Scan a URL to check if it is a scam or suspicious site",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string", description: "The URL to scan" },
              message: { type: "string", description: "The message that contained the URL (optional)" },
            },
            required: ["url"],
          },
        },
        server: { url: `${process.env["PUBLIC_URL"] ?? "http://localhost:3000"}/api/vapi/tool-call` },
      },
      {
        type: "function",
        function: {
          name: "check_message",
          description: "Check a suspicious message for scam indicators",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string", description: "The suspicious message text to check" },
            },
            required: ["message"],
          },
        },
        server: { url: `${process.env["PUBLIC_URL"] ?? "http://localhost:3000"}/api/vapi/tool-call` },
      },
    ],
    firstMessage: "Hi, I'm ElderShield. I help protect you from online scams. Do you have a link or message you'd like me to check?",
  });
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleScanUrl(url: string, messageText?: string): Promise<string> {
  if (!url) return "I didn't catch the URL. Could you repeat it?";

  // Normalize — add https:// if missing
  const normalized = url.startsWith("http") ? url : `https://${url}`;

  try {
    new URL(normalized);
  } catch {
    return `I couldn't understand that URL: ${url}. Could you spell it out?`;
  }

  // Run TinyFish analysis synchronously for voice (low latency matters)
  const page = await analyzePageWithTinyFish(normalized);
  const classification = classifyRisk(page, messageText);

  // Also persist to DB asynchronously (fire and forget)
  persistResult(normalized, messageText, classification).catch(() => {});

  return buildVoiceResponse(normalized, classification);
}

async function handleCheckMessage(message: string): Promise<string> {
  if (!message) return "I didn't catch the message. Could you repeat it?";

  // Extract URL if present
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return handleScanUrl(urlMatch[0], message);
  }

  // No URL — classify based on text alone
  const fakePage = {
    url: "text-only-scan",
    suspiciousSignals: [] as string[],
    hasLoginForm: false,
    hasPaymentForm: false,
    raw: {},
  };
  const classification = classifyRisk(fakePage, message);
  return buildVoiceResponse("the message", classification);
}

function buildVoiceResponse(
  urlOrLabel: string,
  classification: { risk: string; explanation: string }
): string {
  const domain = (() => { try { return new URL(urlOrLabel).hostname; } catch { return urlOrLabel; } })();

  if (classification.risk === "SCAM") {
    return `Warning! ${domain} is a scam. Do not click that link, do not enter any personal information, and do not call any phone numbers it shows. ${classification.explanation.slice(0, 200)}`;
  }
  if (classification.risk === "SUSPICIOUS") {
    return `${domain} looks suspicious. I'd recommend not clicking it. ${classification.explanation.slice(0, 150)}`;
  }
  return `${domain} appears to be safe. No scam indicators were detected.`;
}

async function persistResult(
  url: string,
  messageText: string | undefined,
  classification: { risk: string; explanation: string }
): Promise<void> {
  try {
    const hid = await ensureHousehold();
    const jobId = uuidv4();
    const job: ScanJob = { jobId, householdId: hid, url, messageText };
    await enqueueScanJob(job);
  } catch { /* non-fatal */ }
}

async function ensureHousehold(): Promise<string> {
  const result = await pool.query(
    "INSERT INTO households (label) VALUES ($1) RETURNING id",
    ["Vapi Voice Household"]
  );
  return result.rows[0].id as string;
}

// ─── Vapi request types ───────────────────────────────────────────────────────

interface VapiToolCallBody {
  message?: {
    toolCalls?: Array<{
      id: string;
      function?: {
        name?: string;
        arguments?: Record<string, unknown>;
      };
    }>;
  };
}
