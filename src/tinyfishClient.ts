import { config } from "./config";
import type { PageAnalysis } from "./models";

const TINYFISH_TIMEOUT_MS = 60_000; // TinyFish can take a while for full page analysis

// ─── Goal & output schema sent to TinyFish ───────────────────────────────────

const SCAM_DETECTION_GOAL = `
You are a scam-detection assistant. Analyse this web page and return a JSON object with:
- title: the page title
- domain: the domain name
- has_login_form: true if there is a username/password login form
- has_payment_form: true if there is a credit card or payment form
- suspicious_signals: an array of strings describing any suspicious signals found.
  Possible values: "brand_mismatch", "urgency_language", "prize_claim", "fake_support",
  "unusual_domain", "excessive_permissions", "phishing_indicators", "malware_indicators",
  "too_good_to_be_true", "impersonation".
  Return an empty array if none found.
- summary: a one-sentence plain-English summary of what this page does.
Return ONLY valid JSON, no markdown fences.
`.trim();

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    domain: { type: "string" },
    has_login_form: { type: "boolean" },
    has_payment_form: { type: "boolean" },
    suspicious_signals: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
  },
  required: ["title", "domain", "has_login_form", "has_payment_form", "suspicious_signals", "summary"],
};

// ─── Client ───────────────────────────────────────────────────────────────────

export async function analyzePageWithTinyFish(url: string): Promise<PageAnalysis> {
  console.log(`[tinyfish] Analysing URL: ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TINYFISH_TIMEOUT_MS);

  let raw: unknown;

  try {
    const response = await fetch(config.tinyfishEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.tinyfishApiKey,
      },
      body: JSON.stringify({
        url,
        goal: SCAM_DETECTION_GOAL,
        browser_profile: "lite",
        agent_config: {
          mode: "strict",
          max_steps: 30,
        },
        capture_config: {
          elements: true,
          snapshots: false,
          screenshots: false,
        },
        output_schema: OUTPUT_SCHEMA,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const body = await response.text().catch(() => "(no body)");
      console.error(`[tinyfish] HTTP ${response.status}: ${body}`);
      throw new Error(`TinyFish returned HTTP ${response.status}`);
    }

    // TinyFish may return SSE lines or a final JSON blob.
    // We read the full body and extract the last JSON object.
    const text = await response.text();
    raw = extractLastJson(text);
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[tinyfish] Request failed: ${msg}`);
    // Return a degraded PageAnalysis so the pipeline can continue
    return degradedAnalysis(url, msg);
  }

  return mapToPageAnalysis(url, raw);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractLastJson(text: string): unknown {
  // SSE streams emit lines like: data: {...}
  // We want the last complete JSON object in the response.
  const lines = text.split("\n").reverse();
  for (const line of lines) {
    const stripped = line.replace(/^data:\s*/, "").trim();
    if (stripped.startsWith("{")) {
      try {
        return JSON.parse(stripped);
      } catch {
        // keep looking
      }
    }
  }
  // Fallback: try parsing the whole body
  try {
    return JSON.parse(text.trim());
  } catch {
    return {};
  }
}

function mapToPageAnalysis(url: string, raw: unknown): PageAnalysis {
  // Safe mapping from unknown TinyFish response → typed PageAnalysis
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // TinyFish may nest the result under an "output" or "result" key
  const data = (
    r["output"] ?? r["result"] ?? r["data"] ?? r
  ) as Record<string, unknown>;

  const signals: string[] = [];
  const rawSignals = data["suspicious_signals"];
  if (Array.isArray(rawSignals)) {
    for (const s of rawSignals) {
      if (typeof s === "string") signals.push(s);
    }
  }

  const domain =
    typeof data["domain"] === "string"
      ? data["domain"]
      : extractDomain(url);

  return {
    url,
    finalUrl: typeof data["final_url"] === "string" ? data["final_url"] : undefined,
    domain,
    hasLoginForm: Boolean(data["has_login_form"]),
    hasPaymentForm: Boolean(data["has_payment_form"]),
    suspiciousSignals: signals,
    raw,
  };
}

function degradedAnalysis(url: string, errorMsg: string): PageAnalysis {
  return {
    url,
    domain: extractDomain(url),
    hasLoginForm: false,
    hasPaymentForm: false,
    suspiciousSignals: ["analysis_failed"],
    raw: { error: errorMsg },
  };
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
