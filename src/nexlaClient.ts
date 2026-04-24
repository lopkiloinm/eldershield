/**
 * Nexla client — ingests Slack messages via the Nexla REST API.
 *
 * Auth: NEXLA_SESSION_TOKEN (Bearer token, ~1h TTL).
 *   Copy from: https://dataops.nexla.io → Settings → Authentication.
 *
 * API used: GET /nexsets/{id}/samples?output_only=true&count=100
 *   This is the standard Nexla data API — no special GenAI Tools permissions needed.
 *   The session token you already have is sufficient.
 *
 * Nexset setup (one-time in Nexla UI):
 *   1. Integrate → New Data Flow → Slack connector
 *   2. Template: "Fetch Channel Messages (Incremental)"
 *      - Channel: your Slack channel ID (e.g. C0123456789)
 *      - Oldest: {now-1} with Time Unit = Day  (last 24h)
 *   3. Save → copy the Nexset ID → NEXLA_INBOX_NEXSET_ID
 *
 * Slack message shape from the "Fetch Channel Messages" template:
 *   { type, text, user, ts, thread_ts?, attachments?, blocks? }
 */

import { config } from "./config";

export interface InboxMessage {
  id: string;       // Slack message ts (unique per channel)
  text: string;     // message body
  user?: string;    // Slack user ID
  url?: string;     // first URL extracted from text
  channel?: string; // channel ID
  ts?: string;      // raw Slack timestamp
}

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/gi;
// Also catch bare domains like "pay-pail.com" that lack a protocol
const BARE_DOMAIN_REGEX = /\b([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/[^\s"'<>)\]]*)?/g;
const NEXLA_TIMEOUT_MS = 30_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchInboxMessages(): Promise<InboxMessage[]> {
  console.log(
    `[nexla] Fetching Slack messages from Nexset ${config.nexlaInboxNexsetId}` +
    (config.nexlaSlackChannelId ? ` (channel ${config.nexlaSlackChannelId})` : "")
  );

  // Use the standard Nexla data_sets samples endpoint.
  // Note: Nexla's internal API uses /data_sets not /nexsets.
  const url =
    `${config.nexlaApiBase}/data_sets/${config.nexlaInboxNexsetId}/samples` +
    `?count=100`;

  const data = await nexlaFetch(url);
  return mapSlackRows(data);
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function nexlaFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEXLA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.nexlaSessionToken}`,
        Accept: "application/vnd.nexla.api.v1+json",
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "(no body)");
      throw new Error(`Nexla GET ${url} → HTTP ${response.status}: ${text}`);
    }

    return await response.json();
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[nexla] ${msg}`);
  }
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

/**
 * Map Nexla samples response → InboxMessage[].
 *
 * output_only=true returns an array of record objects directly:
 *   [{ text, user, ts, type, ... }, ...]
 *
 * Without output_only it returns:
 *   [{ input: { rawMessage: {...} }, output: { rawMessage: {...} } }, ...]
 */
function mapSlackRows(data: unknown): InboxMessage[] {
  const messages: InboxMessage[] = [];
  const rows = extractRows(data);

  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];

    // Nexla samples return { rawMessage: { value: [{...slack msgs...}] }, nexlaMetaData }
    // Unwrap rawMessage first
    if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      if (r["rawMessage"] && typeof r["rawMessage"] === "object") {
        row = r["rawMessage"];
      }
    }

    // rawMessage may itself be { value: [...slack messages...] }
    // Flatten those into individual message rows
    if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      if (Array.isArray(r["value"])) {
        for (const msg of r["value"]) {
          const m = parseSlackMessage(msg, i);
          if (m) messages.push(m);
        }
        continue;
      }
    }

    // Direct slack message object
    const m = parseSlackMessage(row, i);
    if (m) messages.push(m);
  }

  console.log(`[nexla] Mapped ${messages.length} Slack messages`);
  return messages;
}

function parseSlackMessage(row: unknown, fallbackIdx: number): InboxMessage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const text = String(r["text"] ?? r["message"] ?? r["body"] ?? "").trim();
  if (!text) return null;

  const ts = String(r["ts"] ?? r["timestamp"] ?? r["event_ts"] ?? fallbackIdx);
  const user = typeof r["user"] === "string" ? r["user"] : undefined;
  const channel =
    typeof r["channel"] === "string"
      ? r["channel"]
      : config.nexlaSlackChannelId || undefined;

  const urlMatches = text.match(URL_REGEX);
  const bareMatches = text.match(BARE_DOMAIN_REGEX);
  const rawUrl = urlMatches
    ? urlMatches[0]
    : bareMatches
    ? `https://${bareMatches[0]}`
    : undefined;
  const url = rawUrl ? unwrapSlackUrl(rawUrl) : undefined;

  return { id: ts, text, user, url, channel, ts };
}

function extractRows(data: unknown): unknown[] {
  // Direct array (some Nexla versions return this)
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;

    // Wrapped formats
    for (const key of ["data", "rows", "records", "result", "messages", "items", "samples"]) {
      if (Array.isArray(d[key])) return d[key] as unknown[];
    }
  }

  return [];
}

function unwrapSlackUrl(raw: string): string {
  // <https://example.com|display text> → https://example.com
  const match = raw.match(/^<?(https?:\/\/[^|>]+)(?:\|[^>]*)?>?$/);
  return match ? match[1] : raw;
}
