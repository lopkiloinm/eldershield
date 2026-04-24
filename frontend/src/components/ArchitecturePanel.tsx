/**
 * Architecture panel — shows the full sponsor tool stack with live status dots.
 * This is the "explain every implementation" view for judges.
 */

import { useEffect, useState } from "react";
import { api, type HealthResponse, type QueueStats } from "../api";

interface Tool {
  name: string;
  role: string;
  detail: string;
  link: string;
  color: string;
  icon: string;
  prize?: string;
}

const TOOLS: Tool[] = [
  {
    name: "Ghost.build",
    role: "Agent-native Postgres DB",
    detail: "Stores households, messages, url_inspections, and risk_events. Every scan is durably logged. Ghost provides unlimited Postgres DBs designed for agents — created with `ghost create --name eldershield`.",
    link: "https://ghost.build",
    color: "text-violet-400",
    icon: "👻",
    prize: "$500 × 5",
  },
  {
    name: "Redis Agent Memory",
    role: "Two-tier agent memory",
    detail: "Working memory holds per-scan session context (auto-summarized when tokens overflow). Long-term memory stores shared scam archetypes and per-household episodic history — semantically searchable via vector search. The classifier recalls 'we've seen this before' patterns.",
    link: "https://redis.github.io/agent-memory-server/",
    color: "text-red-400",
    icon: "🧠",
    prize: "AirPods + 10k credits",
  },
  {
    name: "Redis / BullMQ",
    role: "Real-time job queue",
    detail: "scan_jobs queue with retry, exponential backoff, and dead-letter. The autonomous worker loop drains it every 15s. Queue depth shown live in the header.",
    link: "https://bullmq.io",
    color: "text-red-400",
    icon: "⚡",
  },
  {
    name: "TinyFish",
    role: "Remote browser agent",
    detail: "Opens every suspicious URL in a real remote browser. Extracts login forms, payment forms, and suspicious signals using a structured goal prompt. Returns JSON mapped to PageAnalysis. No Playwright, no proxies — one API call.",
    link: "https://tinyfish.ai",
    color: "text-cyan-400",
    icon: "🐟",
    prize: "Mac Mini + $300 credits",
  },
  {
    name: "Nexla",
    role: "Slack inbox ingestion",
    detail: "Pulls Slack messages from a Nexset via GET /data_sets/{id}/samples. Extracts URLs (including bare domains like pay-pail.com). The inbox sweep is x402-gated — agents must pay to trigger bulk scans.",
    link: "https://nexla.com",
    color: "text-blue-400",
    icon: "🔗",
    prize: "$750 + $5k credits",
  },
  {
    name: "Vapi",
    role: "Voice AI agent",
    detail: "POST /api/vapi/tool-call handles scan_url and check_message tool calls during live voice calls. Returns spoken-friendly responses. GET /api/vapi/assistant-config returns the full assistant JSON for the Vapi dashboard.",
    link: "https://vapi.ai",
    color: "text-pink-400",
    icon: "🎙️",
    prize: "$500 credits + AirPods",
  },
  {
    name: "WunderGraph",
    role: "Federated BFF",
    detail: "GET /api/wg/dashboard federates Ghost DB + Redis queue + GitHub cited.md into one response. GET /api/wg/household/:id joins messages and risk events. This is the WunderGraph pattern: one endpoint, multiple upstream sources.",
    link: "https://wundergraph.com",
    color: "text-orange-400",
    icon: "🕸️",
    prize: "$2,000",
  },
  {
    name: "Senso",
    role: "cited.md context layer",
    detail: "cited.md has YAML frontmatter with payment config (x402 + Stripe MPP). On startup, ElderShield registers with Senso. After every scan, notifySenso() is called so the new entry is indexed and discoverable by other AI agents.",
    link: "https://senso.ai",
    color: "text-emerald-400",
    icon: "📄",
    prize: "$3k credits",
  },
  {
    name: "GitHub REST API",
    role: "cited.md publishing",
    detail: "After every scan, the worker appends a Markdown entry to cited.md via PUT /repos/{owner}/{repo}/contents/{path}. The file is read first (GET) to get the current SHA, then updated atomically.",
    link: "https://docs.github.com/en/rest",
    color: "text-slate-400",
    icon: "🐙",
  },
  {
    name: "Chainguard",
    role: "Hardened Docker image",
    detail: "Dockerfile uses cgr.dev/chainguard/node:latest as both builder and runtime. No shell, no package manager, runs as non-root. Minimal attack surface for production deployments.",
    link: "https://chainguard.dev",
    color: "text-yellow-400",
    icon: "🔒",
    prize: "$1,000",
  },
  {
    name: "Akash Network",
    role: "Decentralized deployment",
    detail: "akash.yml defines 4 services: eldershield + agent-memory + redis + worker-cron sidecar. The cron container calls /api/worker/scan-next every 30s — fully autonomous on decentralized compute.",
    link: "https://akash.network",
    color: "text-purple-400",
    icon: "☁️",
    prize: "$500 credits",
  },
  {
    name: "x402",
    role: "HTTP payment rails",
    detail: "POST /api/inbox-sweep returns 402 Payment Required if X-Payment-Token is missing. Agents must attach the token to trigger bulk scans. cited.md is also configured with x402 payment rails via Senso.",
    link: "https://x402.org",
    color: "text-amber-400",
    icon: "💳",
  },
];

interface Props {
  health: HealthResponse | null;
  queueStats: QueueStats | null;
}

export function ArchitecturePanel({ health, queueStats }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [wgData, setWgData] = useState<Record<string, unknown> | null>(null);
  const [wgLoading, setWgLoading] = useState(false);

  const loadWgDashboard = () => {
    setWgLoading(true);
    fetch("/api/wg/dashboard")
      .then((r) => r.json())
      .then((d) => setWgData(d as Record<string, unknown>))
      .catch(() => {})
      .finally(() => setWgLoading(false));
  };

  useEffect(() => { loadWgDashboard(); }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
      <div>
        <h2 className="font-semibold text-white">Architecture</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every sponsor tool — what it does and how it's wired in.
        </p>
      </div>

      {/* Live system status */}
      <div className="grid grid-cols-2 gap-2">
        <StatusCard
          label="Ghost DB"
          value={health?.db ? "Connected" : "Offline"}
          ok={health?.db ?? false}
          sub="Postgres audit log"
          icon="👻"
        />
        <StatusCard
          label="Redis"
          value={health?.redis ? "Connected" : "Offline"}
          ok={health?.redis ?? false}
          sub="Queue + memory"
          icon="⚡"
        />
        <StatusCard
          label="Queue"
          value={queueStats ? `${queueStats.waiting + queueStats.active} pending` : "—"}
          ok={(queueStats?.failed ?? 0) === 0}
          sub={queueStats ? `${queueStats.completed} completed` : "loading…"}
          icon="📋"
        />
        <StatusCard
          label="cited.md"
          value={wgData ? `${(wgData["citedMd"] as Record<string,unknown>)?.["totalEntries"] ?? 0} entries` : "—"}
          ok={!!wgData}
          sub="GitHub + Senso"
          icon="📄"
        />
      </div>

      {/* WunderGraph federated dashboard */}
      {wgData && (
        <div className="bg-slate-800/50 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-orange-400 font-medium">🕸️ WunderGraph federated view</span>
            <button onClick={loadWgDashboard} disabled={wgLoading} className="text-slate-600 hover:text-slate-400 text-[10px]">
              {wgLoading ? "…" : "↻ refresh"}
            </button>
          </div>
          <WgRow label="Ghost DB" data={(wgData["db"] as Record<string,unknown>) ?? {}} />
          <WgRow label="Redis queue" data={(wgData["queue"] as Record<string,unknown>) ?? {}} />
          <WgRow label="cited.md" data={(wgData["citedMd"] as Record<string,unknown>) ?? {}} />
        </div>
      )}

      {/* Tool cards */}
      <div className="flex flex-col gap-2">
        {TOOLS.map((tool) => {
          const isOpen = expanded === tool.name;
          return (
            <button
              key={tool.name}
              onClick={() => setExpanded(isOpen ? null : tool.name)}
              className="w-full text-left bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 rounded-lg px-3 py-2.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{tool.icon}</span>
                  <div className="min-w-0">
                    <span className={`text-sm font-medium ${tool.color}`}>{tool.name}</span>
                    <span className="text-slate-500 text-xs ml-2">{tool.role}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {tool.prize && (
                    <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/50 px-1.5 py-0.5 rounded">
                      {tool.prize}
                    </span>
                  )}
                  <span className="text-slate-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs text-slate-400 leading-relaxed text-left space-y-1.5">
                  <p>{tool.detail}</p>
                  <a
                    href={tool.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-500 hover:text-sky-400 inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tool.link} ↗
                  </a>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Data flow diagram */}
      <div className="bg-slate-800/30 rounded-lg p-3 font-mono text-[10px] text-slate-500 leading-relaxed">
        <p className="text-slate-400 text-xs font-sans font-medium mb-2">Data flow</p>
        <p>Slack → <span className="text-blue-400">Nexla</span> → inbox-sweep (x402)</p>
        <p className="ml-4">→ <span className="text-red-400">Redis</span> scan_jobs queue</p>
        <p className="ml-8">→ autonomous worker (15s poll)</p>
        <p className="ml-12">→ <span className="text-cyan-400">TinyFish</span> remote browser</p>
        <p className="ml-12">→ <span className="text-red-400">Redis Memory</span> recall + promote</p>
        <p className="ml-12">→ risk classifier (SAFE/SUSPICIOUS/SCAM)</p>
        <p className="ml-12">→ <span className="text-violet-400">Ghost</span> Postgres audit log</p>
        <p className="ml-12">→ GitHub cited.md + <span className="text-emerald-400">Senso</span> notify</p>
      </div>
    </div>
  );
}

function StatusCard({ label, value, ok, sub, icon }: {
  label: string; value: string; ok: boolean; sub: string; icon: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <span>{icon}</span>{label}
        </span>
        <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-500"}`} />
      </div>
      <p className="text-sm font-medium text-white">{value}</p>
      <p className="text-[10px] text-slate-600">{sub}</p>
    </div>
  );
}

function WgRow({ label, data }: { label: string; data: Record<string, unknown> }) {
  if ("error" in data) return (
    <div className="flex items-center gap-2 text-slate-600">
      <span className="w-16 shrink-0">{label}</span>
      <span className="text-red-600">unavailable</span>
    </div>
  );

  const entries = Object.entries(data)
    .filter(([k]) => k !== "source")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(" · ");

  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      <span className="text-slate-400 break-all">{entries}</span>
    </div>
  );
}
