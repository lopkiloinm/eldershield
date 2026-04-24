import { useState } from "react";
import { api, pollResult } from "../api";
import { Spinner } from "./Spinner";
import { RiskBadge } from "./RiskBadge";
import type { FeedEntry } from "./ResultsFeed";

interface Props { onResult: (entry: FeedEntry) => void }
type Phase = "idle" | "sweeping" | "processing" | "done" | "error" | "payment_required";

interface JobSummary {
  jobId: string;
  url: string;
  risk: "SAFE" | "SUSPICIOUS" | "SCAM" | "pending";
}

export function InboxSweepPanel({ onResult }: Props) {
  const [token, setToken]       = useState("demo-token");
  const [phase, setPhase]       = useState<Phase>("idle");
  const [enqueued, setEnqueued] = useState<number | null>(null);
  const [jobs, setJobs]         = useState<JobSummary[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSweep = async () => {
    setPhase("sweeping");
    setEnqueued(null);
    setJobs([]);
    setErrorMsg(null);

    try {
      const resp = await api.inboxSweep(token.trim());
      setEnqueued(resp.enqueued);

      if (resp.enqueued === 0) { setPhase("done"); return; }

      setPhase("processing");
      const jobIds: string[] = [];

      for (let i = 0; i < resp.enqueued; i++) {
        try {
          const w = await api.processNext();
          if ("jobId" in w && w.jobId) {
            jobIds.push(w.jobId);
            setJobs((prev) => [...prev, { jobId: w.jobId, url: "…", risk: "pending" }]);
          }
        } catch { /* non-fatal */ }
      }

      const CONCURRENCY = 3;
      for (let i = 0; i < jobIds.length; i += CONCURRENCY) {
        await Promise.all(
          jobIds.slice(i, i + CONCURRENCY).map(async (jid) => {
            try {
              const result = await pollResult(jid, { intervalMs: 1500, timeoutMs: 60_000 });
              setJobs((prev) => prev.map((j) => j.jobId === jid ? { ...j, url: result.url, risk: result.risk } : j));
              onResult({ jobId: result.jobId, url: result.url, risk: result.risk, explanation: result.explanation, createdAt: result.createdAt, householdId: resp.householdId, memoryContextUsed: false, source: "inbox" });
            } catch { /* non-fatal */ }
          })
        );
      }
      setPhase("done");
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 402) setPhase("payment_required");
      else { setPhase("error"); setErrorMsg(e.message ?? String(err)); }
    }
  };

  const reset = () => { setPhase("idle"); setEnqueued(null); setJobs([]); setErrorMsg(null); };
  const busy = phase === "sweeping" || phase === "processing";
  const processed = jobs.filter((j) => j.risk !== "pending").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Inbox Sweep</h2>
        <p className="text-slate-400 text-sm mt-1">
          Pulls Slack messages from your Nexla Nexset, extracts every URL, and scans each one autonomously. No copy-pasting required.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: "🔗", label: "Nexla", desc: "Fetches Slack messages" },
          { icon: "⚡", label: "Redis Queue", desc: "Parallel processing" },
          { icon: "💳", label: "x402", desc: "Payment-gated" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-3 text-center">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xs font-medium text-slate-300">{s.label}</div>
            <div className="text-[10px] text-slate-600">{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div className="card p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
            X-Payment-Token
            <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full">x402 required</span>
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
            placeholder="demo-token"
            className="input-field font-mono"
          />
          <p className="text-xs text-slate-600">
            Use <code className="text-slate-500">demo-token</code> for local dev. Set <code className="text-slate-500">PAYMENT_TOKEN_SECRET</code> in .env for production.
          </p>
        </div>

        <button
          onClick={handleSweep}
          disabled={busy || !token.trim()}
          className="btn-primary py-3 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Spinner size={4} />
              <span>{phase === "sweeping" ? "Fetching Slack messages…" : `Processing ${processed} / ${enqueued ?? "?"}`}</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <span>Sweep Inbox</span>
            </>
          )}
        </button>
      </div>

      {/* Live job list */}
      {jobs.length > 0 && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">Live results</p>
            <span className="text-xs text-slate-500">{processed}/{jobs.length} complete</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all duration-500"
              style={{ width: `${jobs.length > 0 ? (processed / jobs.length) * 100 : 0}%` }}
            />
          </div>
          <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto scrollbar-thin">
            {jobs.map((j) => {
              const domain = (() => { try { return new URL(j.url).hostname; } catch { return j.url; } })();
              return (
                <div key={j.jobId} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 border text-sm transition-all ${
                  j.risk === "pending" ? "border-slate-800 bg-slate-900/50"
                  : j.risk === "SCAM" ? "border-red-900/50 bg-red-950/20"
                  : j.risk === "SUSPICIOUS" ? "border-amber-900/50 bg-amber-950/10"
                  : "border-emerald-900/50 bg-emerald-950/10"
                }`}>
                  <span className="text-slate-300 truncate flex-1 font-mono text-xs">
                    {j.url === "…" ? <span className="text-slate-600 italic">resolving…</span> : domain}
                  </span>
                  {j.risk === "pending" ? <Spinner size={3} /> : <RiskBadge risk={j.risk} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 402 */}
      {phase === "payment_required" && (
        <div className="card border-amber-900/60 p-5 flex flex-col gap-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-lg">💳</span>
            <p className="text-amber-300 font-semibold">402 Payment Required</p>
          </div>
          <p className="text-sm text-slate-400">The server rejected the token. Enter a valid <code className="text-amber-400">X-Payment-Token</code> to proceed.</p>
          <button onClick={reset} className="btn-secondary px-4 py-2 text-sm self-start mt-1">Try again</button>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="card border-emerald-900/60 p-5 flex items-center justify-between animate-fade-in">
          <div>
            <p className="text-emerald-300 font-semibold">
              {enqueued === 0 ? "No URLs found in inbox" : `Swept ${processed} URL${processed !== 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Results published to cited.md via GitHub</p>
          </div>
          <button onClick={reset} className="btn-secondary px-4 py-2 text-sm">New sweep</button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="card border-red-900/60 p-4 flex items-start gap-3 animate-fade-in">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <p className="text-sm text-red-300 flex-1">{errorMsg}</p>
          <button onClick={reset} className="text-slate-500 hover:text-slate-300 transition-colors">✕</button>
        </div>
      )}
    </div>
  );
}
