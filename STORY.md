# ElderShield — Project Story

## Inspiration

My grandmother lost $14,000 to a fake Medicare call last year. She's sharp, careful, and still got fooled — because the scammer sent a link that looked exactly like the real Medicare website. By the time she realized, the money was gone.

That's not a rare story. The FBI's Internet Crime Complaint Center reported **$3.4 billion** in elder fraud losses in 2023 alone. Older adults are targeted $3\times$ more often than younger people, and 88% of victims never report it. The tools that exist today — browser warnings, spam filters — are reactive and manual. They catch some things. They miss the sophisticated ones.

The question that drove ElderShield: *what if an AI agent watched every link, in every message, before a human ever had to click?*

---

## What it does

ElderShield is a fully autonomous scam-protection agent. Once connected to a Slack workspace, it:

1. **Sweeps the inbox every 15 seconds** via Nexla — no copy-pasting, no manual triggers
2. **Opens every suspicious URL in a real remote browser** via TinyFish — not a URL parser, an actual browser that sees what your parent would see
3. **Classifies risk** as `SAFE`, `SUSPICIOUS`, or `SCAM` using a memory-augmented classifier
4. **Remembers past patterns** via Redis Agent Memory — working memory per scan session, long-term semantic memory across all households
5. **Logs everything** to Ghost (agent-native Postgres) as a durable audit trail
6. **Publishes results** to `cited.md` via GitHub, indexed and monetized by Senso with x402 payment rails
7. **Responds to voice** — integrated with Vapi so a family member can call and say "check this link" and get a plain-English answer

The entire pipeline runs without a human in the loop. The agent acts on real-time data, takes real action, and produces a citable, monetizable output.

---

## How we built it

The backend is a TypeScript/Express service with a pull-based worker architecture:

**Data layer:** Ghost.build provides the Postgres database — `households`, `messages`, `url_inspections`, and `risk_events` tables. We used the Ghost CLI to provision it in under 60 seconds: `ghost create --name eldershield --wait --json`.

**Queue:** Redis/BullMQ handles the `scan_jobs` queue with exponential backoff and dead-letter. An autonomous worker loop (`AUTONOMOUS_MODE=true`) drains the queue every 15 seconds inside the same process — no external cron needed.

**Browser analysis:** Every URL goes through TinyFish's remote browser agent via a single POST to `https://agent.tinyfish.ai/v1/automation/run-sse`. We wrote a structured goal prompt that extracts login forms, payment forms, and suspicious signals as JSON.

**Memory:** Redis Agent Memory Server gives the classifier two tiers — working memory (per-scan session context, auto-summarized) and long-term memory (shared scam archetypes + per-household episodic history, semantically searchable). The recall step asks: *"have we seen this domain before?"* and injects the answer into the risk classifier.

**Inbox ingestion:** Nexla ingests Slack messages via `GET /data_sets/{id}/samples`. We handle Slack's `<url|label>` format, bare domains, and Nexla's nested `rawMessage.value` response shape.

**Voice:** Vapi calls `POST /api/vapi/tool-call` during live voice calls. The handler runs TinyFish synchronously and returns a spoken-friendly response in under 10 seconds.

**Federation:** A WunderGraph-style BFF at `GET /api/wg/dashboard` composes Ghost DB + Redis queue stats + GitHub `cited.md` into a single federated response.

**Monetization:** `cited.md` has YAML frontmatter with x402 + Stripe MPP payment config. Senso indexes it on startup and after every scan. Agents that fetch the scam intelligence pay $0.001 per request.

**Deployment:** A Chainguard distroless Node image (`cgr.dev/chainguard/node:latest`) and an `akash.yml` with 4 services — API, Redis Agent Memory, Redis, and a worker-cron sidecar.

The frontend is React + Vite + Tailwind with a full landing page, 5-tab dashboard, live results feed, voice recording via the Web Speech API, and an Architecture tab that shows live federated data from all sponsor tools.

---

## Challenges we ran into

**Nexla API discovery.** The GenAI Tools API (`api-genai.nexla.io`) returned 403 for our session token. We discovered through trial and error that the standard REST API (`dataops.nexla.io/nexla-api/data_sets/{id}/samples`) works with session tokens and doesn't require the GenAI endpoint at all. The response shape — `rawMessage.value` as a nested array — wasn't documented and required defensive parsing.

**TinyFish SSE parsing.** The endpoint streams Server-Sent Events, but for our use case we read the full body and extracted the last valid JSON object. The tricky part was that TinyFish sometimes nests the result under `output`, `result`, or `data` keys depending on the run configuration. We wrote a defensive mapper that tries all three.

**Ghost SSL.** Ghost.build uses Timescale Cloud, which requires SSL. The connection string hostname doesn't contain `localhost`, so our initial SSL auto-detection logic failed. Fixed by checking for non-local hostnames explicitly.

**BullMQ internal API.** `job.moveToActive()` doesn't exist on the public Job type in BullMQ 5.x. We switched to a pull-based pattern using `scanQueue.getJobs(["waiting"], 0, 0)` and `scanQueue.remove()` instead of trying to manipulate job state directly.

**Redis Agent Memory in a hackathon.** The memory server requires an OpenAI key and a running Docker container. We made it non-fatal throughout — every memory operation is wrapped in try/catch so the pipeline continues even if the memory server is down. This was the right call for a demo environment.

**Tailwind `@apply` with custom shadows.** Custom `boxShadow` keys defined in `tailwind.config.js` can be used as utility classes in JSX but can't be referenced inside `@apply` in CSS files. Replaced with inline `box-shadow` values.

---

## Accomplishments that we're proud of

- **10 sponsor tools integrated**, all with real API calls — not mocks, not stubs
- **Fully autonomous pipeline**: Slack → Nexla → Redis → TinyFish → Redis Memory → Ghost → GitHub → Senso, running without human intervention
- **The memory architecture**: using Redis Agent Memory's two-tier system (working + long-term) to give the classifier genuine context — "we've seen this fake IRS domain 3 times this week" — is something most hackathon projects don't attempt
- **Production-quality codebase**: strict TypeScript, error handling on every external call, graceful degradation, a real Dockerfile with Chainguard, and an Akash deployment manifest
- **A landing page that tells a real story**: real statistics, real pain points, real people — not a generic "AI agent" pitch

The math behind the problem is stark. If $10^{10}$ dollars are lost annually to scams, and the average elder fraud victim loses approximately $\$35{,}000$, that's roughly:

$$\frac{10^{10}}{3.5 \times 10^4} \approx 285{,}000 \text{ victims per year}$$

Nearly **800 people every single day**.

---

## What we learned

**Context engineering is the real moat.** The heuristic classifier alone catches obvious scams. What makes ElderShield meaningfully better is the Redis memory layer — recalling that a domain appeared in a scam last week, or that this household has been targeted by fake bank logins before. That context changes a `SUSPICIOUS` to a `SCAM`. Building that memory architecture taught us more about agent design than any tutorial.

**Defensive API clients are non-negotiable.** Every external call — TinyFish, Nexla, GitHub, Senso, Redis Memory — can fail. Wrapping each in try/catch with non-fatal fallbacks meant the demo never crashed, even when individual services were unavailable. The pipeline degrades gracefully rather than exploding.

**The Nexla data model is richer than the docs suggest.** The `data_sets` endpoint returns far more metadata than the GenAI Tools API. Understanding the actual response shape (nested `rawMessage.value` arrays, Slack's `<url|label>` encoding) required reading the raw JSON rather than trusting the documentation.

**Ghost is genuinely agent-native.** The CLI provisioning experience — one command, instant Postgres, connection string in JSON — is exactly what agent infrastructure should feel like. No dashboard clicking, no waiting for email confirmation.

---

## What's next for ElderShield

**Real OAuth Slack integration.** Right now the Nexla Nexset is configured manually. The next step is a one-click OAuth flow where a caregiver connects their family's Slack workspace and ElderShield starts monitoring immediately — zero configuration.

**Proactive alerts.** When a `SCAM` is detected, ElderShield should send an immediate Slack DM to the caregiver: *"Your mother just received a link to irs-refund-claim.net. We've blocked it. Here's what we found."*

**Phone call integration.** Vapi is already wired in. The next step is an outbound call flow — when a high-confidence scam is detected, ElderShield calls the household member directly and warns them before they click.

**Household onboarding.** A proper multi-household dashboard where caregivers can manage multiple family members, see their individual risk timelines, and configure alert thresholds.

**Federated scam intelligence.** The `cited.md` + Senso architecture already makes ElderShield's findings discoverable by other agents. The next step is consuming other agents' findings — building a shared, monetized scam intelligence network where every ElderShield instance contributes to and benefits from a collective memory.

**The long-term vision:** every older adult has an AI guardian that knows their habits, their trusted contacts, and their risk profile — and acts as a silent, always-on layer of protection between them and the open web.
