import { useState, useRef } from "react";
import { api, pollResult, type WorkerResponse } from "../api";
import { RiskBadge } from "./RiskBadge";
import { Spinner } from "./Spinner";
import type { FeedEntry } from "./ResultsFeed";

interface Props { onResult: (entry: FeedEntry) => void }
type Phase = "idle" | "enqueuing" | "processing" | "done" | "error";

const PRESETS = [
  { label: "IRS Scam", url: "https://irs-refund-claim.net/verify", msg: "Your IRS refund of $1,847 is pending. Verify your account now to claim." },
  { label: "Fake Bank", url: "https://secure-bankofamerica-login.com", msg: "Unusual activity detected. Confirm your identity immediately." },
  { label: "Prize Scam", url: "https://free-prize-winner.example.com/claim", msg: "Congratulations! You have been selected. Click to claim your $500 prize." },
  { label: "Safe Link", url: "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms", msg: "" },
];

export function ScanPanel({ onResult }: Props) {
  const [url, setUrl]           = useState("");
  const [message, setMessage]   = useState("");
  const [phase, setPhase]       = useState<Phase>("idle");
  const [jobId, setJobId]       = useState<string | null>(null);
  const [result, setResult]     = useState<FeedEntry | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef                = useRef(false);

  const handleScan = async () => {
    if (!url.trim()) return;
    abortRef.current = false;
    setPhase("enqueuing");
    setResult(null);
    setErrorMsg(null);
    setJobId(null);

    try {
      const { jobId: jid, householdId } = await api.scanUrl(url.trim(), message.trim() || undefined);
      if (abortRef.current) return;
      setJobId(jid);
      setPhase("processing");

      let workerResp: WorkerResponse | Record<string, never> = {};
      try { workerResp = await api.processNext(); } catch { /* non-fatal */ }
      if (abortRef.current) return;

      const scanResult = await pollResult(jid, { intervalMs: 1500, timeoutMs: 90_000 });
      if (abortRef.current) return;

      const entry: FeedEntry = {
        jobId: scanResult.jobId,
        url: scanResult.url,
        risk: scanResult.risk,
        explanation: scanResult.explanation,
        createdAt: scanResult.createdAt,
        householdId,
        memoryContextUsed: (workerResp as WorkerResponse).memoryContextUsed ?? false,
        source: "scan",
      };
      setResult(entry);
      setPhase("done");
      onResult(entry);
    } catch (err: unknown) {
      if (abortRef.current) return;
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    abortRef.current = true;
    setPhase("idle");
    setResult(null);
    setErrorMsg(null);
    setJobId(null);
  };

  const busy = phase === "enqueuing" || phase === "processing";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Scan a URL</h2>
        <p className="text-slate-400 text-sm mt-1">
          Paste any suspicious link. ElderShield opens it in a real browser via TinyFish, checks for scam signals, and logs the result to Ghost DB.
        </p>
      </div>

      {/* Quick presets */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-2">Quick test</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setUrl(p.url); setMessage(p.msg); }}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-800/50 transition-all disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="card p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300">URL to scan</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && handleScan()}
            placeholder="https://suspicious-site.example.com"
            disabled={busy}
            className="input-field"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300">
            Message context
            <span className="text-slate-600 font-normal ml-2">optional — improves detection</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="Paste the suspicious message that contained this link…"
            className="input-field resize-none"
          />
        </div>

        <button
          onClick={handleScan}
          disabled={busy || !url.trim()}
          className="btn-primary py-3 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <Spinner size={4} />
              <span>{phase === "enqueuing" ? "Enqueuing job…" : "TinyFish analysing…"}</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Scan URL</span>
            </>
          )}
        </button>

        {/* Progress */}
        {jobId && phase === "processing" && (
          <div className="flex items-center gap-3 bg-sky-950/30 border border-sky-800/40 rounded-xl px-4 py-3">
            <Spinner size={4} />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-sky-300 font-medium">Opening URL in remote browser</span>
              <span className="text-xs text-slate-500 font-mono">job {jobId.slice(0, 8)}…</span>
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {phase === "done" && result && (
        <div className={`card p-6 flex flex-col gap-4 animate-slide-up ${
          result.risk === "SCAM" ? "border-red-800/60 shadow-glow-red"
          : result.risk === "SUSPICIOUS" ? "border-amber-800/60"
          : "border-emerald-800/60 shadow-glow-emerald"
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <RiskBadge risk={result.risk} large />
              <p className="text-slate-400 text-xs font-mono mt-2">
                {(() => { try { return new URL(result.url).hostname; } catch { return result.url; } })()}
              </p>
            </div>
            <button onClick={reset} className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
              New scan
            </button>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{result.explanation}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 pt-3 border-t border-slate-800/60">
            <span className="font-mono">job: {result.jobId.slice(0, 8)}…</span>
            <span>·</span>
            <span>{new Date(result.createdAt).toLocaleTimeString()}</span>
            {result.memoryContextUsed && (
              <span className="text-sky-500 flex items-center gap-1">
                <span>🧠</span> Redis Memory used
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="card border-red-900/60 p-4 flex items-start gap-3 animate-fade-in">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <div className="flex-1">
            <p className="text-sm text-red-300">{errorMsg}</p>
          </div>
          <button onClick={reset} className="text-slate-500 hover:text-slate-300 transition-colors">✕</button>
        </div>
      )}

      {/* How it works */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { icon: "🐟", label: "TinyFish", desc: "Real browser" },
          { icon: "🧠", label: "Redis Memory", desc: "Pattern recall" },
          { icon: "👻", label: "Ghost DB", desc: "Audit log" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xs font-medium text-slate-300">{s.label}</div>
            <div className="text-[10px] text-slate-600">{s.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
