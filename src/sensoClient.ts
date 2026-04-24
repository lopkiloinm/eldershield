/**
 * Senso context layer integration for ElderShield.
 *
 * Senso makes cited.md discoverable and monetizable by AI agents.
 * Every time ElderShield publishes a scan result to cited.md, it also
 * registers the content with Senso so other agents can find, cite,
 * and pay for it via x402/MPP payment rails.
 *
 * Setup:
 *   1. Sign up at senso.ai
 *   2. Get your API key → SENSO_API_KEY in .env
 *   3. Register your cited.md URL → SENSO_CITED_MD_URL in .env
 *      e.g. https://raw.githubusercontent.com/lopkiloinm/eldershield/main/cited.md
 *
 * Docs: https://docs.senso.ai/docs/hello-world
 */

import { config } from "./config";

const SENSO_TIMEOUT_MS = 10_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify Senso that cited.md has been updated with new scan results.
 * Senso indexes the content so AI agents can discover and cite it.
 */
export async function notifySenso(entry: {
  url: string;
  risk: string;
  explanation: string;
  jobId: string;
}): Promise<void> {
  if (!config.sensoApiKey) {
    // Senso not configured — skip silently
    return;
  }

  try {
    await sensoFetch("/v1/content/notify", {
      source_url: config.sensoCitedMdUrl,
      content_type: "scan_result",
      metadata: {
        url: entry.url,
        risk: entry.risk,
        job_id: entry.jobId,
        agent: "eldershield",
        published_at: new Date().toISOString(),
      },
      // x402 payment config — agents pay to fetch this content
      payment: {
        enabled: true,
        price_usd: 0.001, // $0.001 per fetch
        rails: ["x402", "stripe-mpp"],
      },
    });
    console.log(`[senso] Notified Senso of new cited.md entry for ${entry.url}`);
  } catch (err: unknown) {
    // Non-fatal
    console.warn(`[senso] Notification failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Register ElderShield's cited.md with Senso on startup.
 * This makes the entire cited.md discoverable by AI agents.
 */
export async function registerWithSenso(): Promise<void> {
  if (!config.sensoApiKey) return;

  try {
    await sensoFetch("/v1/sources/register", {
      url: config.sensoCitedMdUrl,
      name: "ElderShield Scam Intelligence",
      description: "Autonomous scam detection results for URLs and messages. Each entry includes risk classification (SAFE/SUSPICIOUS/SCAM), domain analysis, and plain-English explanation.",
      tags: ["scam-detection", "elder-safety", "url-analysis", "ai-agent"],
      payment: {
        enabled: true,
        price_usd: 0.001,
        rails: ["x402", "stripe-mpp"],
      },
    });
    console.log("[senso] Registered cited.md with Senso context layer");
  } catch (err: unknown) {
    console.warn(`[senso] Registration failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function sensoFetch(path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SENSO_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.sensoApiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.sensoApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      throw new Error(`Senso ${path} → HTTP ${response.status}: ${text}`);
    }
    return await response.json();
  } catch (err: unknown) {
    clearTimeout(timer);
    throw err;
  }
}
