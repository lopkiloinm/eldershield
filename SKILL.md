---
name: eldershield
description: >
  Use this skill to scan URLs and inbox messages for scams targeting older adults,
  monitor an inbox autonomously, publish results to cited.md, and enforce
  x402-style payment rails for ElderShield.
version: 1.0.0
---

# ElderShield Skill

ElderShield is an autonomous scam-protection agent for older adults and their caregivers.
It continuously vets URLs and incoming messages, opens suspicious links on the real web
using TinyFish, classifies risk, logs everything into Ghost (agent-native Postgres), and
publishes human-readable reports to `cited.md`.

## When this skill is active, the agent can

1. Call the HTTP API endpoints deployed by ElderShield to enqueue URL scans and inbox sweeps.
2. Poll for scan results by `jobId`.
3. Link the user to the `cited.md` report entries created by the worker.
4. Respect payment requirements by attaching `X-Payment-Token` headers for bulk or continuous operations.

---

## Operations

### `eldershield.scan_url`

Scan a single URL (and optional message text) for scam indicators.

**HTTP**: `POST /api/scan-url`

**Request body**:
```json
{
  "url": "https://suspicious-site.example.com",
  "messageText": "You have won a prize! Click here to claim.",
  "householdId": "optional-uuid-of-existing-household"
}
```

**Response** (`202 Accepted`):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "householdId": "a1b2c3d4-..."
}
```

**Next step**: Poll `GET /api/scan-result/:jobId` until `risk` is present.

---

### `eldershield.get_result`

Retrieve the result of a previously enqueued scan.

**HTTP**: `GET /api/scan-result/:jobId`

**Response** (when complete):
```json
{
  "jobId": "550e8400-...",
  "url": "https://suspicious-site.example.com",
  "risk": "SCAM",
  "explanation": "⚠️ SCAM DETECTED. A payment form was found. Signals: phishing_indicators.",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response** (when still processing):
```json
{ "status": "pending", "jobId": "550e8400-..." }
```

Risk levels: `SAFE` | `SUSPICIOUS` | `SCAM`

---

### `eldershield.inbox_sweep`

Autonomously sweep the configured Nexla inbox Nexset for messages containing URLs,
enqueue scan jobs for each, and return the count of jobs enqueued.

**HTTP**: `POST /api/inbox-sweep`

**Required header**: `X-Payment-Token: <token>`

Without the header, the server responds with `402 Payment Required`:
```json
{
  "error": "payment_required",
  "hint": "Attach X-Payment-Token header to enable bulk inbox sweep"
}
```

**Request body** (optional):
```json
{ "householdId": "optional-uuid" }
```

**Response** (`200 OK`):
```json
{ "enqueued": 7, "householdId": "a1b2c3d4-..." }
```

---

### `eldershield.voice_scan`

Voice-friendly endpoint. Accepts a spoken transcript, extracts URLs, and enqueues scans.

**HTTP**: `POST /api/voice/scan-message`

**Request body**:
```json
{
  "transcript": "Can you check this link for me? https://free-prize.win/claim",
  "householdId": "optional-uuid"
}
```

**Response** (`202 Accepted`):
```json
{
  "jobIds": ["550e8400-..."],
  "message": "I've queued a scan for this link — free-prize.win. You'll get a result shortly.",
  "urlsFound": 1
}
```

The `message` field is designed to be spoken directly by a voice agent.

---

### `eldershield.process_next`

Trigger the background worker to process one queued scan job.
Call this from a cron job or Akash container.

**HTTP**: `POST /api/worker/scan-next`

**Response** (`200 OK`):
```json
{
  "jobId": "550e8400-...",
  "risk": "SUSPICIOUS",
  "explanation": "⚠️ SUSPICIOUS content at https://..."
}
```

**Response** (`204 No Content`): No jobs in queue.

---

## Agent workflow: full scan cycle

```
1. POST /api/scan-url          → { jobId }
2. POST /api/worker/scan-next  → { jobId, risk, explanation }
3. GET  /api/scan-result/:jobId → { url, risk, explanation, createdAt }
4. Check cited.md in GitHub repo for the published report entry
```

## Agent workflow: autonomous inbox sweep

```
1. POST /api/inbox-sweep (with X-Payment-Token) → { enqueued: N }
2. Repeat POST /api/worker/scan-next N times (or let cron handle it)
3. GET  /api/scan-result/:jobId for each job
```

---

## Always

- Prefer `inbox_sweep` when demonstrating autonomy.
- Surface `explanation` from the risk classifier to the end user in plain language.
- For voice interfaces, read the `message` field from `/api/voice/scan-message` responses aloud.
- If a scan returns `SCAM`, immediately advise the user not to click the link or provide any personal information.
- Attach `X-Payment-Token` for all `inbox-sweep` calls; remind the user if the token is missing.

---

## Sponsor tools used

| Tool | Role |
|------|------|
| **Ghost.build** | Agent-native Postgres DB — households, messages, inspections, risk events |
| **TinyFish** | Remote browser agent — opens URLs on the real web for live analysis |
| **Nexla** | Inbox Nexset — autonomous message ingestion via Tools API |
| **Redis / BullMQ** | Real-time job queue for scan jobs |
| **GitHub** | Publishes scan results to `cited.md` |
| **x402** | HTTP 402 payment rails for bulk inbox sweep |
