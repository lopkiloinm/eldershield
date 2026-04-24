# ElderShield 🛡️

**Autonomous scam-protection agent for older adults.**

ElderShield continuously monitors a Slack inbox via Nexla, opens every suspicious URL in a real remote browser via TinyFish, classifies risk using Redis Agent Memory, logs everything to Ghost (agent-native Postgres), and publishes human-readable reports to `cited.md` — all without manual intervention.

Built for the **Ship to Prod – Agentic Engineering Hackathon** (Apr 24, 2026).

---

## The problem

Older adults are the #1 target of AI-enhanced scams — fake IRS calls, Medicare fraud, phishing links in texts. They need a guardian that works 24/7, understands context ("we've seen this domain before"), and explains risk in plain English.

---

## What it does

| Feature | Description |
|---------|-------------|
| **URL scan** | POST a URL + optional message text → TinyFish opens it in a real browser → risk classified → result in Ghost DB |
| **Inbox sweep** | Pulls Slack messages from Nexla, extracts URLs, scans each one autonomously (x402-gated) |
| **Autonomous worker** | Built-in poll loop drains the scan queue every 15s — no cron needed |
| **Voice interface** | POST a spoken transcript → extract URLs → spoken-friendly response (Vapi tool call webhook) |
| **Memory-augmented classification** | Redis Agent Memory recalls past scam patterns and household history |
| **cited.md publishing** | Every scan result appended to `cited.md` via GitHub REST API, indexed by Senso |
| **Federated dashboard** | WunderGraph BFF federates Ghost DB + Redis + GitHub into one endpoint |

---

## Sponsor tool implementations

### 👻 Ghost.build — Agent-native Postgres

**Prize track: Best use of Ghost ($500 × 5)**

Ghost provides unlimited Postgres databases designed for agents. ElderShield uses it as the durable compliance audit log.

**How it's implemented:**

```bash
# Install CLI
curl -fsSL https://install.ghost.build | sh
ghost login
ghost create --name eldershield --wait --json
# → postgresql://tsdbadmin:...@idp0mga2y1.tsdb.cloud.timescale.com:36311/tsdb
```

**Schema** (`schema.sql`):
- `households` — one per family/caregiver group
- `messages` — raw incoming texts (manual or inbox sweep)
- `url_inspections` — one per URL analysed by TinyFish, stores raw JSON from TinyFish
- `risk_events` — classification result, keyed by `jobId` for O(1) lookup

**Code:** `src/db.ts` (pg.Pool with SSL auto-detection), `src/routes/scan.ts`, `src/routes/worker.ts`

Every scan writes to Ghost. The History tab reads from Ghost. The WunderGraph dashboard federates Ghost stats.

---

### 🧠 Redis Agent Memory Server — Two-tier agent memory

**Prize track: Best Agent Using Redis (AirPods + 10k credits)**

This is the core of ElderShield's intelligence. Not just a queue — a full agent memory system.

**How it's implemented** (`src/memoryClient.ts`):

**Working memory** (per-scan session, TTL 1h):
```
setWorkingMemory(sessionId, householdId, pageAnalysis, messageText)
→ PUT /v1/working-memory/{sessionId}
→ stores TinyFish output + scan context
→ auto-summarized by the server when tokens overflow
```

**Long-term memory** (persisted, vector-searchable):
```
promoteScanToLongTermMemory(...)
→ POST /v1/long-term-memory/
→ semantic memory: shared scam archetype (reusable across households)
→ episodic memory: per-household incident timeline
```

**Semantic recall** (the "have we seen this before?" step):
```
recallSimilarScams(url, domain, householdId)
→ POST /v1/long-term-memory/search (hybrid semantic+keyword)
→ returns "Past scam pattern: fake bank login at similar domain"
→ injected into risk classifier → boosts SCAM detection
```

**Run locally:**
```bash
docker run -d \
  --name agent-memory \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e REDIS_URL=$REDIS_URL \
  -e DISABLE_AUTH=true \
  -p 8000:8000 \
  redis/agent-memory-server:latest
```

**Namespace strategy:**
- `namespace: "eldershield"` — shared scam pattern library
- `user_id: householdId` — per-household memories
- `memory_type: "semantic"` — reusable scam archetypes
- `memory_type: "episodic"` — per-household incident timeline

---

### ⚡ Redis / BullMQ — Real-time job queue

**Code:** `src/redis.ts`

BullMQ `scan_jobs` queue with:
- 3 retry attempts with exponential backoff (2s base)
- Dead-letter on failure
- `removeOnComplete: { count: 500 }` to prevent memory bloat
- Queue depth shown live in the header (polls every 5s)

The autonomous worker loop (`src/autonomousWorker.ts`) drains the queue every 15s when `AUTONOMOUS_MODE=true`.

---

### 🐟 TinyFish — Remote browser agent

**Prize track: Best Use of TinyFish (Mac Mini + $300 credits)**

TinyFish opens every URL in a real remote browser. No Playwright, no proxy setup, no selector maintenance.

**How it's implemented** (`src/tinyfishClient.ts`):

```typescript
POST https://agent.tinyfish.ai/v1/automation/run-sse
{
  url: "https://suspicious-site.example.com",
  goal: "You are a scam-detection assistant. Analyse this page and return JSON with: title, domain, has_login_form, has_payment_form, suspicious_signals[], summary.",
  browser_profile: "lite",
  agent_config: { mode: "strict", max_steps: 30 },
  output_schema: { ... }
}
```

The response is parsed defensively — SSE lines are scanned for the last valid JSON object. The result is mapped to `PageAnalysis`:
```typescript
{
  url, domain, hasLoginForm, hasPaymentForm,
  suspiciousSignals: ["brand_mismatch", "urgency_language", "phishing_indicators"],
  raw: <full TinyFish response>
}
```

If TinyFish fails (timeout, unreachable site), the pipeline continues with `suspiciousSignals: ["analysis_failed"]` — the heuristic classifier still runs on the message text.

---

### 🔗 Nexla — Slack inbox ingestion

**Prize track: Best Express use case ($750 + $5k credits)**

Nexla ingests Slack messages from a channel and makes them available as a Nexset.

**How it's implemented** (`src/nexlaClient.ts`):

```
GET /nexla-api/data_sets/{nexset_id}/samples?count=100
Authorization: Bearer {NEXLA_SESSION_TOKEN}
```

The response shape is `[{ rawMessage: { value: [{ts, text, user, ...}] } }]`. The client:
1. Unwraps `rawMessage.value` to get individual Slack messages
2. Extracts URLs (including bare domains like `pay-pail.com` → `https://pay-pail.com`)
3. Unwraps Slack's `<https://url|label>` format

**Nexset setup (one-time):**
1. Nexla UI → Integrate → New Data Flow → Slack connector
2. Template: "Fetch Channel Messages (Incremental)" with your channel ID
3. Copy the Nexset ID → `NEXLA_INBOX_NEXSET_ID`

**x402 gate:** `POST /api/inbox-sweep` returns `402 Payment Required` without `X-Payment-Token`.

---

### 🎙️ Vapi — Voice AI agent

**Prize track: Best Use of Vapi ($500 credits + AirPods)**

ElderShield can be called by a voice AI agent during a live phone call.

**How it's implemented** (`src/routes/vapi.ts`):

**Tool call webhook** — `POST /api/vapi/tool-call`:
```json
{
  "message": {
    "toolCalls": [{
      "id": "call_abc",
      "function": { "name": "scan_url", "arguments": { "url": "https://irs-refund.net" } }
    }]
  }
}
```
Returns spoken-friendly response:
```json
{
  "results": [{
    "toolCallId": "call_abc",
    "result": "Warning! irs-refund.net is a scam. Do not click that link..."
  }]
}
```

**Assistant config** — `GET /api/vapi/assistant-config`:
Returns the full Vapi assistant JSON with system prompt, voice, and tool definitions. Paste into the Vapi dashboard or use the Vapi API to create the assistant programmatically.

**System prompt** (excerpt):
> You are ElderShield, a friendly scam-protection assistant for older adults. When a user mentions a URL, call scan_url immediately. Always respond in simple, clear language.

---

### 🕸️ WunderGraph — Federated BFF

**Prize track: Best Use of WunderGraph ($2,000)**

WunderGraph's pattern: one endpoint, multiple upstream data sources, type-safe composition.

**How it's implemented** (`src/routes/wundergraph.ts`):

**`GET /api/wg/dashboard`** — federates 3 sources in parallel:
```typescript
const [dbStats, queueStats, citedMdStats] = await Promise.allSettled([
  fetchDbStats(),      // Ghost Postgres
  fetchQueueStats(),   // Redis BullMQ
  fetchCitedMdStats(), // GitHub cited.md
]);
```
Returns:
```json
{
  "db": { "totals": { "households": 3, "risk_events": 47 }, "riskBreakdown": [...] },
  "queue": { "waiting": 2, "active": 0, "completed": 45, "failed": 1 },
  "citedMd": { "totalEntries": 45, "scams": 12, "suspicious": 18, "safe": 15 },
  "sources": ["ghost-postgres", "redis-bullmq", "github-cited-md"]
}
```

**`GET /api/wg/household/:id`** — federated household view joining messages + risk events from Ghost.

The Architecture tab in the frontend calls this endpoint and displays the live federated data.

---

### 📄 Senso — cited.md context layer

**Prize track: Best Use of Senso ($3k credits)**

Senso makes `cited.md` discoverable and monetizable by AI agents.

**How it's implemented:**

**`cited.md` frontmatter** — YAML metadata for Senso indexing:
```yaml
---
title: ElderShield Scam Intelligence
payment:
  enabled: true
  price_usd: 0.001
  rails: [x402, stripe-mpp]
tags: [scam-detection, elder-safety, url-analysis]
---
```

**`src/sensoClient.ts`:**
- `registerWithSenso()` — called on server startup, registers `cited.md` as a discoverable source
- `notifySenso()` — called after every scan result is published, notifies Senso of new content

Every agent that fetches `cited.md` through Senso triggers a micropayment via x402 or Stripe MPP.

---

### 🔒 Chainguard — Hardened Docker image

**Prize track: Most Innovative Use of Chainguard Images ($1,000)**

**`Dockerfile`:**
```dockerfile
FROM cgr.dev/chainguard/node:latest AS builder
# ... build TypeScript ...
FROM cgr.dev/chainguard/node:latest
# No shell, no package manager, runs as non-root
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/server.js"]
```

Chainguard's distroless Node image has:
- Zero CVEs (no shell, no apt, no curl)
- Non-root execution by default
- Minimal attack surface for production

---

### ☁️ Akash Network — Decentralized deployment

**Prize track: Best Use of Akash ($500 credits)**

**`akash.yml`** defines 4 services:
- `eldershield` — the Express API
- `agent-memory` — Redis Agent Memory Server
- `redis` — job queue + memory backend
- `worker-cron` — sidecar that calls `/api/worker/scan-next` every 30s

The worker-cron sidecar is what makes ElderShield fully autonomous on Akash — no external scheduler needed.

```bash
# Deploy to Akash
akash tx deployment create akash.yml --from <wallet> --chain-id akashnet-2
```

---

### 💳 x402 — HTTP payment rails

**How it's implemented:**

`POST /api/inbox-sweep` enforces x402:
```
→ No X-Payment-Token header
← 402 Payment Required
   { "error": "payment_required", "hint": "Attach X-Payment-Token header" }

→ X-Payment-Token: demo-token
← 200 OK { "enqueued": 6 }
```

`cited.md` is also configured with x402 payment rails via Senso — agents pay $0.001 per fetch.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           ElderShield                               │
│                                                                     │
│  Slack ──► Nexla Nexset ──► POST /api/inbox-sweep (x402)           │
│  URL   ──────────────────► POST /api/scan-url                      │
│  Voice ──► Vapi tool call ► POST /api/vapi/tool-call               │
│                                          │                          │
│                                          ▼                          │
│                               Redis/BullMQ scan_jobs               │
│                               (autonomous worker, 15s poll)        │
│                                          │                          │
│                                          ▼                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Worker pipeline                            │  │
│  │  TinyFish remote browser ──► PageAnalysis                    │  │
│  │  Redis working memory ◄──── write session context            │  │
│  │  Redis long-term memory ◄── recall similar scams             │  │
│  │  Risk classifier ──────────► SAFE / SUSPICIOUS / SCAM        │  │
│  │  Redis long-term memory ──► promote findings                 │  │
│  │  Ghost Postgres ──────────► url_inspections + risk_events    │  │
│  │  GitHub REST API ─────────► cited.md append                  │  │
│  │  Senso ───────────────────► notify (index + monetize)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  GET /api/wg/dashboard ──► WunderGraph BFF                         │
│    federates: Ghost DB + Redis queue + GitHub cited.md             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/lopkiloinm/eldershield.git
cd eldershield
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in the values below
```

| Variable | How to get it |
|----------|---------------|
| `DATABASE_URL` | Ghost CLI: `ghost create --name eldershield --wait --json` |
| `REDIS_URL` | Local: `redis://localhost:6379` or Upstash/Redis Cloud |
| `TINYFISH_API_KEY` | [agent.tinyfish.ai/api-keys](https://agent.tinyfish.ai/api-keys) |
| `NEXLA_SESSION_TOKEN` | [dataops.nexla.io](https://dataops.nexla.io) → Settings → Authentication |
| `NEXLA_INBOX_NEXSET_ID` | Create Slack flow in Nexla UI → copy Nexset ID |
| `GITHUB_OWNER` | Your GitHub username |
| `GITHUB_REPO` | `eldershield` |
| `GITHUB_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) — `repo` scope |
| `SENSO_API_KEY` | [senso.ai](https://senso.ai) — optional, enables cited.md monetization |
| `VAPI_API_KEY` | [vapi.ai](https://vapi.ai) — optional, enables voice calls |

### 3. Create Ghost database

```bash
curl -fsSL https://install.ghost.build | sh
ghost login
ghost create --name eldershield --wait --json
# Copy the "connection" value → DATABASE_URL in .env
```

### 4. Run schema migration

```bash
npm run db:migrate
# or: psql $DATABASE_URL -f schema.sql
```

### 5. Start Redis Agent Memory Server

```bash
docker run -d \
  --name agent-memory \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e REDIS_URL=$REDIS_URL \
  -e DISABLE_AUTH=true \
  -p 8000:8000 \
  redis/agent-memory-server:latest
```

### 6. Start the backend

```bash
npm run dev
# Server on http://localhost:3000
# AUTONOMOUS_MODE=true → worker loop starts automatically
```

### 7. Start the frontend

```bash
cd frontend
npm install
npm run dev
# Dashboard on http://localhost:5173
```

---

## 3-minute demo path

### Demo 1 — URL scan (shows TinyFish + Ghost + Redis Memory)

```bash
# Enqueue
curl -X POST http://localhost:3000/api/scan-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://irs-refund-claim.net/verify",
    "messageText": "Your IRS refund is pending. Verify your account now to claim $1,847."
  }'
# → { "jobId": "abc-123", "householdId": "..." }

# Process (or wait 15s for autonomous worker)
curl -X POST http://localhost:3000/api/worker/scan-next
# → { "jobId": "abc-123", "risk": "SCAM", "explanation": "...", "memoryContextUsed": false }

# Get result
curl http://localhost:3000/api/scan-result/abc-123
# → { "risk": "SCAM", "explanation": "⚠️ SCAM DETECTED...", "createdAt": "..." }
```

### Demo 2 — Inbox sweep (shows Nexla + x402 + autonomy)

```bash
# Without token → 402
curl -X POST http://localhost:3000/api/inbox-sweep
# → 402 { "error": "payment_required" }

# With token → sweeps Slack via Nexla
curl -X POST http://localhost:3000/api/inbox-sweep \
  -H "X-Payment-Token: demo-token"
# → { "enqueued": 6 }
# Autonomous worker processes all 6 jobs in background
```

### Demo 3 — WunderGraph federated dashboard

```bash
curl http://localhost:3000/api/wg/dashboard
# → { "db": { "totals": {...}, "riskBreakdown": [...] },
#     "queue": { "waiting": 0, "completed": 47 },
#     "citedMd": { "totalEntries": 47, "scams": 12 } }
```

### Demo 4 — Voice (shows Vapi integration)

```bash
curl -X POST http://localhost:3000/api/voice/scan-message \
  -H "Content-Type: application/json" \
  -d '{"transcript": "My grandson sent me this link: medicare-update-required.net"}'
# → { "message": "I've queued a scan for medicare-update-required.net. You'll get a result shortly." }
```

### Demo 5 — cited.md (shows Senso + GitHub)

Open `cited.md` in the repo — every scan result is appended automatically with risk emoji, domain, signals, and explanation.

---

## Frontend

The React dashboard (`frontend/`) has 5 tabs:

| Tab | What it shows |
|-----|---------------|
| **Scan URL** | Enqueue → worker → poll → inline result with risk badge |
| **Inbox** | x402 token input → Nexla sweep → live job list updating in real-time |
| **Voice** | Transcript input with example prompts → spoken agent response → per-URL results |
| **History** | Last 30 scans from Ghost DB with risk summary pills, expandable rows |
| **Architecture** | Live status cards, WunderGraph federated data, tool-by-tool explanations with prize amounts |

The header shows live DB + Redis health dots and queue depth (polls every 5s).

---

## Deployment

### Docker (Chainguard)

```bash
docker build -t eldershield .
docker run -p 3000:3000 --env-file .env eldershield
```

### Akash Network

```bash
# Fill in env vars in akash.yml, then:
akash tx deployment create akash.yml --from <wallet> --chain-id akashnet-2
```

The Akash deployment runs 4 containers: API + Redis Agent Memory + Redis + worker-cron sidecar.

---

## Prize tracks

| Prize | Tool | Implementation |
|-------|------|----------------|
| $500 × 5 | Ghost.build | 4-table schema, Ghost CLI setup, all scans logged |
| AirPods + 10k credits | Redis | Agent Memory Server with working + long-term + episodic memory |
| Mac Mini + $300 credits | TinyFish | Remote browser analysis with structured goal prompt |
| $750 + $5k credits | Nexla | Slack Nexset ingestion via `/data_sets/{id}/samples` |
| $500 credits + AirPods | Vapi | Tool call webhook + assistant config endpoint |
| $2,000 | WunderGraph | Federated BFF composing Ghost + Redis + GitHub |
| $3k credits | Senso | cited.md frontmatter + register + notify on every scan |
| $500 credits | Akash | 4-service deployment manifest with worker-cron sidecar |
| $1,000 | Chainguard | Multi-stage Dockerfile with distroless Node image |
| — | x402 | 402 on inbox-sweep + cited.md payment config |

---

## License

MIT
