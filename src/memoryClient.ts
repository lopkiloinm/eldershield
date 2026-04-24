/**
 * Redis Agent Memory Server client for ElderShield.
 *
 * Two-tier memory architecture:
 *   - Working memory  → per-scan session context (current incident, TinyFish output,
 *                        intermediate reasoning). Auto-summarized when tokens overflow.
 *   - Long-term memory → persisted scam archetypes, per-household patterns, episodic
 *                        event log. Semantically searchable via vector search.
 *
 * Namespace strategy:
 *   namespace = "eldershield"          → shared scam pattern library
 *   namespace = "eldershield"          → per-household memories filtered by user_id
 *   memory_type = "semantic"           → scam archetypes (reusable patterns)
 *   memory_type = "episodic"           → per-household incident timeline
 *
 * Run the memory server locally:
 *   docker run -d \
 *     --name agent-memory \
 *     -e OPENAI_API_KEY=$OPENAI_API_KEY \
 *     -e REDIS_URL=$REDIS_URL \
 *     -p 8000:8000 \
 *     redis/agent-memory-server:latest
 *
 * Docs: https://redis.github.io/agent-memory-server/api/
 */

import { config } from "./config";
import type { PageAnalysis, RiskClassification } from "./models";

const NAMESPACE = "eldershield";
const TIMEOUT_MS = 10_000;

// ─── Types (subset of Agent Memory Server API) ────────────────────────────────

interface MemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
  id?: string;
}

interface MemoryRecord {
  id: string;
  text: string;
  session_id?: string;
  user_id?: string;
  namespace?: string;
  topics?: string[];
  entities?: string[];
  memory_type?: "semantic" | "episodic" | "message";
  event_date?: string;
  pinned?: boolean;
}

interface WorkingMemoryPayload {
  messages?: MemoryMessage[];
  memories?: Omit<MemoryRecord, "id">[];
  data?: Record<string, unknown>;
  context?: string;
  user_id?: string;
  namespace?: string;
  ttl_seconds?: number;
}

interface SearchRequest {
  text?: string;
  search_mode?: "semantic" | "keyword" | "hybrid";
  namespace?: { eq: string };
  user_id?: { eq: string };
  memory_type?: { eq: string };
  topics?: { any: string[] };
  limit?: number;
  recency_boost?: boolean;
}

interface SearchResult {
  memories: Array<{ id: string; text: string; dist?: number; topics?: string[]; memory_type?: string }>;
  total: number;
}

// ─── Working Memory ───────────────────────────────────────────────────────────

/**
 * Write the current scan context into working memory for this session.
 * The memory server auto-summarizes when the token budget is exceeded,
 * so we can freely append without worrying about prompt overflow.
 */
export async function setWorkingMemory(
  sessionId: string,
  householdId: string,
  page: PageAnalysis,
  messageText?: string
): Promise<void> {
  const messages: MemoryMessage[] = [
    {
      role: "user",
      content: messageText
        ? `Scan request: "${messageText}" — URL: ${page.url}`
        : `Scan request for URL: ${page.url}`,
    },
    {
      role: "assistant",
      content: buildPageSummaryText(page),
    },
  ];

  const memories: Omit<MemoryRecord, "id">[] = [
    {
      text: `Scanning ${page.url} (domain: ${page.domain ?? "unknown"})`,
      session_id: sessionId,
      user_id: householdId,
      namespace: NAMESPACE,
      memory_type: "episodic",
      topics: ["scan", "url-check"],
      entities: [page.domain ?? page.url],
      event_date: new Date().toISOString(),
    },
  ];

  const payload: WorkingMemoryPayload = {
    messages,
    memories,
    data: {
      url: page.url,
      domain: page.domain,
      hasLoginForm: page.hasLoginForm,
      hasPaymentForm: page.hasPaymentForm,
      suspiciousSignals: page.suspiciousSignals,
    },
    user_id: householdId,
    namespace: NAMESPACE,
    ttl_seconds: 3600, // 1-hour session window
  };

  await memoryFetch(
    `PUT /v1/working-memory/${encodeURIComponent(sessionId)}?model_name=gpt-4o-mini`,
    "PUT",
    payload
  );

  console.log(`[memory] Working memory set for session ${sessionId}`);
}

/**
 * Retrieve working memory for a session — used to hydrate the risk classifier
 * with "what we already know about this session".
 */
export async function getWorkingMemory(sessionId: string): Promise<WorkingMemoryPayload | null> {
  try {
    const result = await memoryFetch<WorkingMemoryPayload>(
      `GET /v1/working-memory/${encodeURIComponent(sessionId)}`,
      "GET"
    );
    return result;
  } catch {
    return null;
  }
}

// ─── Long-Term Memory ─────────────────────────────────────────────────────────

/**
 * Promote a confirmed scam/suspicious finding into long-term memory.
 * These become the shared scam pattern library and per-household history
 * that future scans can recall via semantic search.
 */
export async function promoteScanToLongTermMemory(
  sessionId: string,
  householdId: string,
  page: PageAnalysis,
  classification: RiskClassification,
  messageText?: string
): Promise<void> {
  if (classification.risk === "SAFE") return; // only persist non-safe findings

  const memoryText = buildLongTermMemoryText(page, classification, messageText);

  const memories: Array<{
    id: string;
    text: string;
    session_id?: string;
    user_id?: string;
    namespace?: string;
    topics?: string[];
    entities?: string[];
    memory_type?: string;
    event_date?: string;
  }> = [
    // Shared scam archetype (semantic — reusable across households)
    {
      id: `scam-pattern-${page.domain ?? page.url}-${Date.now()}`,
      text: memoryText,
      namespace: NAMESPACE,
      memory_type: "semantic",
      topics: buildTopics(page, classification),
      entities: buildEntities(page),
      event_date: new Date().toISOString(),
    },
    // Per-household episodic record
    {
      id: `household-${householdId}-${sessionId}`,
      text: `Household ${householdId} encountered a ${classification.risk} site: ${page.url}. ${classification.explanation}`,
      session_id: sessionId,
      user_id: householdId,
      namespace: NAMESPACE,
      memory_type: "episodic",
      topics: ["household-history", classification.risk.toLowerCase()],
      entities: [page.domain ?? page.url, householdId],
      event_date: new Date().toISOString(),
    },
  ];

  await memoryFetch("POST /v1/long-term-memory/", "POST", {
    memories,
    deduplicate: true,
  });

  console.log(`[memory] Promoted ${classification.risk} finding to long-term memory for ${page.url}`);
}

// ─── Semantic Recall ──────────────────────────────────────────────────────────

/**
 * Search long-term memory for similar past scams.
 * Returns a short context string to inject into the risk classifier prompt
 * or explanation — "we've seen this before" style recall.
 */
export async function recallSimilarScams(
  url: string,
  domain: string | undefined,
  householdId: string
): Promise<string[]> {
  const query = `scam site similar to ${domain ?? url}`;

  // Search 1: shared scam patterns (semantic)
  const sharedSearch: SearchRequest = {
    text: query,
    search_mode: "hybrid",
    namespace: { eq: NAMESPACE },
    memory_type: { eq: "semantic" },
    topics: { any: ["scam", "suspicious", "phishing", "fake-login", "payment-fraud"] },
    limit: 3,
    recency_boost: true,
  };

  // Search 2: this household's history
  const householdSearch: SearchRequest = {
    text: query,
    search_mode: "semantic",
    namespace: { eq: NAMESPACE },
    user_id: { eq: householdId },
    memory_type: { eq: "episodic" },
    limit: 2,
    recency_boost: true,
  };

  const [sharedResults, householdResults] = await Promise.allSettled([
    memoryFetch<SearchResult>("POST /v1/long-term-memory/search", "POST", sharedSearch),
    memoryFetch<SearchResult>("POST /v1/long-term-memory/search", "POST", householdSearch),
  ]);

  const recalled: string[] = [];

  if (sharedResults.status === "fulfilled" && sharedResults.value.memories.length > 0) {
    for (const m of sharedResults.value.memories.slice(0, 2)) {
      recalled.push(`[Past scam pattern] ${m.text}`);
    }
  }

  if (householdResults.status === "fulfilled" && householdResults.value.memories.length > 0) {
    for (const m of householdResults.value.memories.slice(0, 1)) {
      recalled.push(`[This household's history] ${m.text}`);
    }
  }

  if (recalled.length > 0) {
    console.log(`[memory] Recalled ${recalled.length} similar past scams for ${url}`);
  }

  return recalled;
}

/**
 * Build a memory-hydrated prompt context for the risk classifier.
 * Returns a string to prepend to the classifier's reasoning.
 */
export async function buildMemoryContext(
  url: string,
  domain: string | undefined,
  householdId: string,
  sessionId: string
): Promise<string> {
  const [recalled, workingMem] = await Promise.allSettled([
    recallSimilarScams(url, domain, householdId),
    getWorkingMemory(sessionId),
  ]);

  const parts: string[] = [];

  if (recalled.status === "fulfilled" && recalled.value.length > 0) {
    parts.push("## Recalled from memory:");
    parts.push(...recalled.value);
  }

  if (
    workingMem.status === "fulfilled" &&
    workingMem.value?.context
  ) {
    parts.push("## Session context (auto-summarized):");
    parts.push(workingMem.value.context);
  }

  return parts.join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPageSummaryText(page: PageAnalysis): string {
  const parts = [`Analysed ${page.url}`];
  if (page.domain) parts.push(`Domain: ${page.domain}`);
  if (page.hasLoginForm) parts.push("Has login form");
  if (page.hasPaymentForm) parts.push("Has payment form");
  if (page.suspiciousSignals.length > 0) {
    parts.push(`Signals: ${page.suspiciousSignals.join(", ")}`);
  }
  return parts.join(". ");
}

function buildLongTermMemoryText(
  page: PageAnalysis,
  classification: RiskClassification,
  messageText?: string
): string {
  const parts = [
    `${classification.risk} site detected: ${page.url}`,
    `Domain: ${page.domain ?? "unknown"}`,
  ];
  if (page.hasPaymentForm) parts.push("Contains payment form");
  if (page.hasLoginForm) parts.push("Contains login form");
  if (page.suspiciousSignals.length > 0) {
    parts.push(`Signals: ${page.suspiciousSignals.join(", ")}`);
  }
  if (messageText) {
    parts.push(`Original message: "${messageText.slice(0, 200)}"`);
  }
  parts.push(`Assessment: ${classification.explanation.slice(0, 300)}`);
  return parts.join(". ");
}

function buildTopics(page: PageAnalysis, classification: RiskClassification): string[] {
  const topics = [classification.risk.toLowerCase()];
  if (page.hasPaymentForm) topics.push("payment-fraud");
  if (page.hasLoginForm) topics.push("fake-login");
  for (const signal of page.suspiciousSignals) {
    topics.push(signal.replace(/_/g, "-"));
  }
  return [...new Set(topics)];
}

function buildEntities(page: PageAnalysis): string[] {
  const entities: string[] = [];
  if (page.domain) entities.push(page.domain);
  try {
    const tld = new URL(page.url).hostname.split(".").slice(-2).join(".");
    if (tld !== page.domain) entities.push(tld);
  } catch {
    // ignore
  }
  return entities;
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function memoryFetch<T = unknown>(
  pathAndMethod: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  // pathAndMethod is "METHOD /v1/..." — strip the method prefix
  const path = pathAndMethod.replace(/^(GET|POST|PUT|DELETE)\s+/, "");
  const url = `${config.agentMemoryUrl}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (config.agentMemoryToken) {
      headers["Authorization"] = `Bearer ${config.agentMemoryToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      throw new Error(`Agent Memory Server ${method} ${path} → HTTP ${response.status}: ${text}`);
    }

    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[memory] ${msg}`);
  }
}
