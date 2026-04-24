/**
 * Nexla client — ingests Slack messages via a Nexla Nexset.
 *
 * Auth: NEXLA_SESSION_TOKEN (Bearer token, ~1h TTL).
 *   Copy from: https://dataops.nexla.io/nexla-api → Settings → Authentication.
 *   For production use a service key instead (see docs.nexla.com/dev-guides/authentication/service-keys).
 *
 * Nexset setup (one-time in Nexla UI):
 *   1. Integrate → New Data Flow → Slack connector
 *   2. Credential: OAuth2 Slack app (Client ID + Secret)
 *   3. Template: "Fetch Channel Messages (Incremental)"
 *      - Channel: your Slack channel ID (e.g. C0123456789)
 *      - Oldest: {now-1} with Time Unit = Day  (last 24h, incremental)
 *   4. Save → copy the Nexset ID → NEXLA_INBOX_NEXSET_ID
 *
 * API flow:
 *   Step 1: POST /tools:from_nexset  → register the Nexset as a callable tool, get tool ID
 *   Step 2: POST /tools/{id}:execute → execute the tool, get Slack message rows
 *
 * Slack message shape (from Nexla's "Fetch Channel Messages" template):
 *   { type, text, user, ts, thread_ts?, attachments?, blocks? }
 */

import { config } from "./config";

export interface InboxMessage {
  id: string;       // Slack message ts (timestamp, unique per channel)
  text: string;     // message body
  user?: string;    // Slack user ID
  url?: string;     // first URL extracted from text, if any
  channel?: string; // channel ID (from Nexset metadata)
  ts?: string;      // raw Slack timestamp
}

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/gi;
const NEXLA_TIMEOUT_MS = 30_000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the latest Slack messages from the configured Nexla Nexset.
 * Returns messages that contain at least one URL (the ones worth scanning).
 * Messages without URLs are included too so callers can decide.
 */
export async function fetchInboxMessages(): Promise<InboxMessage[]> {
  console.log(
    `[nexla] Fetching Slack messages from Nexset ${config.nexlaInboxNexsetId}` +
    (config.nexlaSlackChannelId ? ` (channel ${config.nexlaSlackChannelId})` : "")
  );

  const toolId = await registerNexsetTool();
  const rows = await executeNexsetTool(toolId);
  return rows;
}

// ─── Step 1: register Nexset as a tool ───────────────────────────────────────

async function registerNexsetTool(): Promise<number> {
  const response = await nexlaFetch(
    `${config.nexlaGenAiBase}/tools:from_nexset`,
    "POST",
    {
      nexset_id: parseInt(config.nexlaInboxNexsetId, 10),
      publish: true,
    }
  );

  const toolId = extractToolId(response);
  console.log(`[nexla] Registered tool ID: ${toolId}`);
  return toolId;
}

// ─── Step 2: execute the tool to get rows ────────────────────────────────────

async function executeNexsetTool(toolId: number): Promise<InboxMessage[]> {
  const response = await nexlaFetch(
    `${config.nexlaGenAiBase}/tools/${toolId}:execute`,
    "POST",
    {
      version: "1.0.0",
      args: {
        format: "dataframe_columns",
        limit: 100,
      },
    }
  );

  return mapSlackRows(response);
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function nexlaFetch(url: string, method: "GET" | "POST", body?: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEXLA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        // Session token auth — copy from Nexla UI Settings → Authentication
        Authorization: `Bearer ${config.nexlaSessionToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.nexla.api.v1+json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      throw new Error(`Nexla ${method} ${url} → HTTP ${response.status}: ${text}`);
    }

    return await response.json();
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[nexla] ${msg}`);
  }
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

function extractToolId(data: unknown): number {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (typeof d["id"] === "number") return d["id"];
    if (d["tool"] && typeof (d["tool"] as Record<string, unknown>)["id"] === "number") {
      return (d["tool"] as Record<string, unknown>)["id"] as number;
    }
    if (Array.isArray(d["tools"]) && d["tools"].length > 0) {
      const first = d["tools"][0] as Record<string, unknown>;
      if (typeof first["id"] === "number") return first["id"];
    }
  }
  throw new Error(`Could not extract tool ID from Nexla response: ${JSON.stringify(data)}`);
}

/**
 * Map Nexla tool execution response → InboxMessage[].
 *
 * Nexla returns Slack messages in one of these shapes depending on
 * the "Fetch Channel Messages" template output:
 *
 *   Array shape:  [{ type, text, user, ts, ... }, ...]
 *   Wrapped:      { data: [...] } | { rows: [...] } | { result: [...] }
 *   Column format (dataframe_columns):
 *     { columns: ["text","user","ts",...], data: [["hello","U123","1234.5",...], ...] }
 */
function mapSlackRows(data: unknown): InboxMessage[] {
  const messages: InboxMessage[] = [];
  const rows = extractRows(data);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;

    // Slack message fields from the "Fetch Channel Messages" template
    const text = String(r["text"] ?? r["message"] ?? r["body"] ?? "").trim();
    if (!text) continue;

    const ts = String(r["ts"] ?? r["timestamp"] ?? r["event_ts"] ?? i);
    const user = typeof r["user"] === "string" ? r["user"] : undefined;
    const channel =
      typeof r["channel"] === "string"
        ? r["channel"]
        : config.nexlaSlackChannelId || undefined;

    // Extract first URL from message text
    const urlMatches = text.match(URL_REGEX);
    // Slack wraps URLs in angle brackets: <https://example.com|label> — unwrap
    const rawUrl = urlMatches ? urlMatches[0] : undefined;
    const url = rawUrl ? unwrapSlackUrl(rawUrl) : undefined;

    messages.push({ id: ts, text, user, url, channel, ts });
  }

  console.log(`[nexla] Mapped ${messages.length} Slack messages from Nexset`);
  return messages;
}

function extractRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;

    // dataframe_columns format: { columns: [...], data: [[...], ...] }
    if (Array.isArray(d["columns"]) && Array.isArray(d["data"])) {
      const cols = d["columns"] as string[];
      return (d["data"] as unknown[][]).map((row) => {
        const obj: Record<string, unknown> = {};
        cols.forEach((col, idx) => { obj[col] = row[idx]; });
        return obj;
      });
    }

    // Wrapped array formats
    for (const key of ["data", "rows", "records", "result", "messages", "items"]) {
      if (Array.isArray(d[key])) return d[key] as unknown[];
    }
  }

  return [];
}

/**
 * Slack wraps URLs as <https://example.com> or <https://example.com|display text>.
 * Strip the angle brackets and optional pipe-label.
 */
function unwrapSlackUrl(raw: string): string {
  const match = raw.match(/^<?(https?:\/\/[^|>]+)(?:\|[^>]*)?>?$/);
  return match ? match[1] : raw;
}
