import { useState } from "react";
import { api, pollResult } from "../api";
import { Spinner } from "./Spinner";
import { RiskBadge } from "./RiskBadge";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "sweeping" | "processing" | "done" | "error" | "payment_required";

interface JobSummary {
  jobId: string;
  url: string;
  risk: "SAFE" | "SUSPICIOUS" | "SCAM" | "pending";
}

export function InboxSweepPanel({ onResult }: Props) {
  const [token, setToken]         = useState("demo-token");
  const [phase, setPhase]         = useState<Phase>("idle");
  const [enqueued, setEnqueued]   = useState<number | null>(null);
  const [jobs, setJobs]           = useState<JobSummary[]>([]);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);

  const handleSweep = async () => {
    setPhase("sweeping");
    setEnqueued(null);
    setJobs([]);
    setErrorMsg(null);

    try {
      const resp = await api.inboxSweep(token.trim());
      setEnqueued(resp.enqueued);

      if (resp.enqueued === 0) {
        setPhase("done");
        return;
      }

      setPhase("processing");

      // Process all jobs concurrently (up to 3 at a time to avoid hammering TinyFish)
      const CONCURRENCY = 3;
      const jobIds: string[] = [];

      // Drain the queue — each processNext call returns a different jobId
      for (let i = 0; i < resp.enqueued; i++) {
        try {
          const w = await api.processNext();
          if ("jobId" in w && w.jobId) {
            jobIds.push(w.jobId);
            setJobs((prev) => [...prev, { jobId: w.jobId, url: "…", risk: "pending" }]);
          }
        } catch { /* non-fatal */ }
      }

      // Now poll all jobIds for results
      const chunks: string[][] = [];
      for (let i = 0; i < jobIds.length; i += CONCURRENCY) {
        chunks.push(jobIds.slice(i, i + CONCURRENCY));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (jid) => {
            try {
              const result = await pollResult(jid, { intervalMs: 1500, timeoutMs: 60_000 });
              setJobs((prev) =>
                prev.map((j) =>
                  j.jobId === jid ? { ...j, url: result.url, risk: result.risk } : j
                )
              );
              onResult({
                jobId: result.jobId,
                url: result.url,
                risk: result.risk,
                explanation: result.explanation,
                createdAt: result.createdAt,
                householdId: resp.householdId,
                memoryContextUsed: false,
                source: "inbox",
              });
            } catch { /* non-fatal */ }
          })
        );
      }

      setPhase("done");
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 402) {
        setPhase("payment_required");
      } else {
        setPhase("error");
        setErrorMsg(e.message ?? String(err));
      }
    }
  };

  const reset = () => {
    setPhase("idle");
    setEnqueued(null);
    setJobs([]);
    setErrorMsg(null);
  };

  const busy = phase === "sweeping" || phase === "processing";
  const processed = jobs.filter((j) => j.risk !== "pending").length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-white">Inbox Sweep</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Pulls Slack messages from Nexla, extracts URLs, scans each one autonomously.
          Requires <code className="text-sky-400">X-Payment-Token</code> (x402).
        </p>
      </div>

      {/* Payment token */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
          X-Payment-Token
          <span className="bg-amber-900/50 text-amber-400 text-[10px] px-1.5 py-0.5 rounded border border-amber-800">x402</span>
        </label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          placeholder="demo-token"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 font-mono"
        />
      </div>

      <button
        onClick={handleSweep}
        disabled={busy || !token.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy
          ? <><Spinner size={4} />{phase === "sweeping" ? "Fetching Slack messages…" : `Processing ${processed}/${enqueued ?? "?"}…`}</>
          : "📬 Sweep Inbox"}
      </button>

      {/* Live job list */}
      {jobs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-slate-600 uppercase tracking-wider">Jobs</p>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto scrollbar-thin">
            {jobs.map((j) => (
              <div key={j.jobId} className="flex items-center justify-between gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5 text-xs">
                <span className="text-slate-400 font-mono truncate flex-1" title={j.url}>
                  {j.url === "…" ? <span className="text-slate-600">resolving…</span> : (() => { try { return new URL(j.url).hostname; } catch { return j.url; } })()}
                </span>
                {j.risk === "pending"
                  ? <Spinner size={3} />
                  : <RiskBadge risk={j.risk} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 402 */}
      {phase === "payment_required" && (
        <div className="bg-amber-950/40 border border-amber-800 rounded-lg px-4 py-3 flex flex-col gap-1">
          <p className="text-sm font-semibold text-amber-300">402 Payment Required</p>
          <p className="text-xs text-amber-400">Invalid or missing X-Payment-Token.</p>
          <button onClick={reset} className="text-xs text-amber-600 hover:text-amber-400 mt-1 self-start">Try again</button>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="bg-emerald-950/30 border border-emerald-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {enqueued === 0 ? "No URLs found in inbox" : `Swept ${processed} URL${processed !== 1 ? "s" : ""}`}
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">Results in the feed →</p>
          </div>
          <button onClick={reset} className="text-xs text-emerald-600 hover:text-emerald-400">New sweep</button>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0 text-lg leading-none">✕</button>
        </div>
      )}

      <div className="bg-slate-800/40 rounded-lg p-3 text-xs text-slate-600 space-y-1">
        <p>🔗 Nexla pulls from your Slack channel Nexset</p>
        <p>🧠 Redis Agent Memory recalls past scam patterns</p>
        <p>📄 Results published to <code className="text-slate-500">cited.md</code> on GitHub</p>
      </div>
    </div>
  );
}
