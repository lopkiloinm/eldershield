# ElderShield 🛡️

**Autonomous scam-protection agent for older adults.**

ElderShield continuously vets URLs and incoming messages, opens suspicious links on the real web using TinyFish, classifies risk, logs everything into Ghost (agent-native Postgres), and publishes human-readable reports to `cited.md` — all without manual intervention.

---

## What it does

1. **URL & message scan** — POST a URL (and optional message text) to get a `jobId`
2. **Autonomous inbox sweep** — Pull messages from a Nexla inbox Nexset, enqueue scans for every URL found (x402-gated)
3. **Background worker** — Pop jobs from Redis/BullMQ, run TinyFish browser analysis, classify risk, persist to Ghost DB, publish to `cited.md`
4. **Result retrieval** — GET a scan result by `jobId`
5. **Voice interface** — POST a spoken transcript; get a spoken-friendly response

---

## Sponsor tools

| Tool | How it's used |
|------|---------------|
| **[Ghost.build](https://ghost.build)** | Agent-native Postgres DB — `households`, `messages`, `url_inspections`, `risk_events` tables (durable compliance audit log) |
| **[Redis Agent Memory Server](https://redis.github.io/agent-memory-server/)** | Two-tier agent memory: **working memory** (per-scan session context, auto-summarized) + **long-term memory** (shared scam pattern library + per-household episodic history, semantically searchable via vector search) |
| **[Redis / BullMQ](https://bullmq.io)** | Real-time job queue — `scan_jobs` queue with retry and backoff |
| **[TinyFish](https://tinyfish.ai)** | Remote browser agent — opens URLs on the real web, extracts login/payment forms and suspicious signals |
| **[Nexla](https://nexla.com)** | Inbox Nexset via Tools API — autonomous message ingestion for inbox sweep |
| **[GitHub REST API](https://docs.github.com/en/rest)** | Publishes scan results to `cited.md` in this repo |
| **x402** | HTTP 402 payment rails — enforced on `/api/inbox-sweep` |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your real API keys and connection strings
```

Required env vars:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Ghost-managed Postgres connection string |
| `REDIS_URL` | Redis connection string (or use `REDIS_HOST`/`REDIS_PORT`) |
| `TINYFISH_API_KEY` | TinyFish API key |
| `NEXLA_SESSION_TOKEN` | Nexla session token (copy from dataops.nexla.io) |
| `NEXLA_INBOX_NEXSET_ID` | Nexla Nexset ID for Slack inbox messages |
| `GITHUB_OWNER` | GitHub username or org |
| `GITHUB_REPO` | GitHub repo name |
| `GITHUB_TOKEN` | GitHub personal access token (needs `contents: write`) |

### 3. Create a Ghost.build database

Ghost.build provides the agent-native Postgres DB. Install the CLI and create a database:

```bash
# Install Ghost CLI
curl -fsSL https://install.ghost.build | sh

# Authenticate (opens browser for GitHub OAuth)
ghost login

# Create the database and capture the connection string
ghost create --name eldershield --wait --json
```

Copy the `connection` value from the JSON output and set it in `.env`:

```
DATABASE_URL=postgresql://tsdbadmin:<password>@<id>.tsdb.cloud.timescale.com:<port>/tsdb
```

### 4. Run database migrations

```bash
npm run db:migrate
# or: psql $DATABASE_URL -f schema.sql
```

### 4. Start Redis Agent Memory Server

```bash
docker run -d \
  --name agent-memory \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e REDIS_URL=$REDIS_URL \
  -e DISABLE_AUTH=true \
  -p 8000:8000 \
  redis/agent-memory-server:latest
```

This gives ElderShield its "brain":
- **Working memory** — per-scan session context, auto-summarized when tokens overflow
- **Long-term memory** — shared scam pattern library + per-household history, vector-searchable
- **Episodic memory** — timeline of incidents per household

### 5. Start the server

```bash
npm run dev        # development (ts-node-dev, hot reload)
npm run build      # compile TypeScript
npm start          # production (compiled JS)
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev        # Vite dev server on http://localhost:5173
```

The frontend proxies all `/api` calls to the Express backend on port 3000, so both need to be running.

---

## Demo path (3-minute demo)

### Step 1 — Scan a URL

```bash
curl -X POST http://localhost:3000/api/scan-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://free-prize-winner.example.com/claim",
    "messageText": "Congratulations! You have won $1000. Click here to claim your prize immediately. Verify your account now."
  }'
# → { "jobId": "550e8400-...", "householdId": "a1b2c3d4-..." }
```

### Step 2 — Process the job (worker)

```bash
curl -X POST http://localhost:3000/api/worker/scan-next
# → { "jobId": "550e8400-...", "risk": "SCAM", "explanation": "⚠️ SCAM DETECTED..." }
```

### Step 3 — Get the result

```bash
curl http://localhost:3000/api/scan-result/550e8400-...
# → { "jobId": "...", "url": "...", "risk": "SCAM", "explanation": "...", "createdAt": "..." }
```

### Step 4 — Check cited.md

The worker automatically appended a Markdown entry to `cited.md` in your GitHub repo.

---

### Inbox sweep (autonomy demo)

```bash
# Without payment token → 402
curl -X POST http://localhost:3000/api/inbox-sweep \
  -H "Content-Type: application/json"
# → 402 { "error": "payment_required", "hint": "..." }

# With payment token → sweeps Nexla inbox
curl -X POST http://localhost:3000/api/inbox-sweep \
  -H "Content-Type: application/json" \
  -H "X-Payment-Token: demo-token" \
  -d '{"householdId": "optional"}'
# → { "enqueued": 5, "householdId": "..." }
```

### Voice scan

```bash
curl -X POST http://localhost:3000/api/voice/scan-message \
  -H "Content-Type: application/json" \
  -d '{"transcript": "Can you check this link? https://irs-refund-claim.net/verify"}'
# → { "jobIds": ["..."], "message": "I've queued a scan for irs-refund-claim.net. You'll get a result shortly.", "urlsFound": 1 }
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          ElderShield                            │
│                                                                 │
│  POST /api/scan-url ────────────────────────────────────────┐  │
│  POST /api/inbox-sweep (x402) ──── Nexla Tools API          │  │
│  POST /api/voice/scan-message                               │  │
│                                                             ▼  │
│                                            Redis/BullMQ queue  │
│                                            scan_jobs           │
│                                                             │  │
│  POST /api/worker/scan-next ◄───────────────────────────────┘  │
│         │                                                       │
│         ├── TinyFish (remote browser) ──► PageAnalysis         │
│         │                                                       │
│         ├── Redis Agent Memory Server ──► Working Memory       │
│         │   (two-tier memory)             (session context)    │
│         │                        ◄──────  Long-term recall     │
│         │                                 (past scam patterns) │
│         │                        ──────►  Promote findings     │
│         │                                 (shared + household) │
│         │                                                       │
│         ├── Risk classifier ────────────► SAFE/SUSPICIOUS/SCAM │
│         │   (memory-augmented)                                  │
│         │                                                       │
│         ├── Ghost Postgres ─────────────► url_inspections      │
│         │   (audit log)                   risk_events          │
│         │                                                       │
│         └── GitHub REST API ────────────► cited.md             │
└─────────────────────────────────────────────────────────────────┘

Redis memory tiers:
  Working memory  → per-scan session, TTL 1h, auto-summarized
  Long-term/semantic → shared scam archetypes, vector search
  Long-term/episodic → per-household incident timeline
```

## Deployment on Akash

The worker endpoint `POST /api/worker/scan-next` is designed to be called by a cron container on Akash:

```yaml
# akash-deploy.yml (excerpt)
services:
  eldershield:
    image: cgr.dev/chainguard/node:latest  # Chainguard hardened image
    env:
      - DATABASE_URL=...
      - REDIS_URL=...
      # ... other env vars
  worker-cron:
    image: curlimages/curl:latest
    command: ["sh", "-c", "while true; do curl -X POST http://eldershield:3000/api/worker/scan-next; sleep 30; done"]
```

---

## Health check

```bash
curl http://localhost:3000/healthz
# → { "ok": true, "db": true, "redis": true, "version": "1.0.0" }
```

---

## License

MIT
