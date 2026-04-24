import { useState, useRef } from "react";
import { api, pollResult, type WorkerResponse } from "../api";
import { RiskBadge } from "./RiskBadge";
import { Spinner } from "./Spinner";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "enqueuing" | "processing" | "done" | "error";

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
      // 1. Enqueue
      const { jobId: jid, householdId } = await api.scanUrl(
        url.trim(),
        message.trim() || undefined
      );
      if (abortRef.current) return;
      setJobId(jid);
      setPhase("processing");

      // 2. Trigger worker (fire-and-forget — it may process a different queued job first)
      let workerResp: WorkerResponse | Record<string, never> = {};
      try { workerResp = await api.processNext(); } catch { /* non-fatal */ }
      if (abortRef.current) return;

      // 3. Poll DB for this specific jobId — guaranteed to resolve once worker runs it
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
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-white">Scan a URL</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Paste a suspicious link. ElderShield opens it with TinyFish, classifies risk, and logs to Ghost DB.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">URL *</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && handleScan()}
          placeholder="https://suspicious-site.example.com"
          disabled={busy}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Message text <span className="text-slate-600">(optional)</span></label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Paste the suspicious message that contained this link…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 resize-none"
        />
      </div>

      <button
        onClick={handleScan}
        disabled={busy || !url.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy
          ? <><Spinner size={4} />{phase === "enqueuing" ? "Enqueuing…" : "TinyFish analysing…"}</>
          : "🔍 Scan URL"}
      </button>

      {/* In-progress status */}
      {jobId && phase === "processing" && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700">
          <Spinner size={3} />
          <span>
            Job <code className="text-sky-400 font-mono">{jobId.slice(0, 8)}…</code>
            {" "}— opening URL in remote browser
          </span>
        </div>
      )}

      {/* Result */}
      {phase === "done" && result && (
        <div className={`flex flex-col gap-3 rounded-xl p-4 border ${
          result.risk === "SCAM"
            ? "bg-red-950/30 border-red-800"
            : result.risk === "SUSPICIOUS"
            ? "bg-amber-950/20 border-amber-800"
            : "bg-emerald-950/20 border-emerald-800"
        }`}>
          <div className="flex items-center justify-between">
            <RiskBadge risk={result.risk} large />
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300">
              New scan
            </button>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{result.explanation}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 pt-1 border-t border-slate-700/50">
            <span>Job: <code className="text-slate-400 font-mono">{result.jobId.slice(0, 8)}…</code></span>
            <span>·</span>
            <span>{new Date(result.createdAt).toLocaleTimeString()}</span>
            {result.memoryContextUsed && (
              <span className="text-sky-500">🧠 memory used</span>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0 text-lg leading-none">✕</button>
        </div>
      )}
    </div>
  );
}
