import { useState, useRef } from "react";
import { api, type ScanResult, type WorkerResponse } from "../api";
import { RiskBadge } from "./RiskBadge";
import { Spinner } from "./Spinner";
import type { FeedEntry } from "./ResultsFeed";

interface Props {
  onResult: (entry: FeedEntry) => void;
}

type Phase = "idle" | "enqueuing" | "processing" | "done" | "error";

export function ScanPanel({ onResult }: Props) {
  const [url, setUrl]             = useState("");
  const [message, setMessage]     = useState("");
  const [phase, setPhase]         = useState<Phase>("idle");
  const [jobId, setJobId]         = useState<string | null>(null);
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const handleScan = async () => {
    if (!url.trim()) return;
    setPhase("enqueuing");
    setResult(null);
    setErrorMsg(null);
    setJobId(null);
    stopPolling();

    try {
      // Step 1: enqueue
      const { jobId: jid } = await api.scanUrl(url.trim(), message.trim() || undefined);
      setJobId(jid);
      setPhase("processing");

      // Step 2: trigger worker
      let workerResp: WorkerResponse | Record<string, never>;
      try {
        workerResp = await api.processNext();
      } catch {
        workerResp = {};
      }

      // Step 3: poll for result (worker may have processed it already)
      const poll = async () => {
        try {
          const r = await api.getResult(jid);
          if ("risk" in r) {
            stopPolling();
            const scanResult = r as ScanResult;
            setResult(scanResult);
            setPhase("done");
            onResult({
              jobId: scanResult.jobId,
              url: scanResult.url,
              risk: scanResult.risk,
              explanation: scanResult.explanation,
              createdAt: scanResult.createdAt,
              memoryContextUsed: (workerResp as WorkerResponse).memoryContextUsed,
              source: "scan",
            });
          }
        } catch {
          // keep polling
        }
      };

      await poll(); // immediate attempt
      if (phase !== "done") {
        pollRef.current = setInterval(poll, 2000);
        // Stop after 90s
        setTimeout(() => {
          stopPolling();
          setPhase((p) => p === "processing" ? "error" : p);
          setErrorMsg((e) => e ?? "Timed out waiting for result");
        }, 90_000);
      }
    } catch (err: unknown) {
      stopPolling();
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const reset = () => {
    stopPolling();
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

      {/* URL input */}
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

      {/* Optional message */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Message text (optional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
          rows={2}
          placeholder="Paste the suspicious message that contained this link…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Action */}
      <button
        onClick={handleScan}
        disabled={busy || !url.trim()}
        className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {busy ? <><Spinner size={4} /> {phase === "enqueuing" ? "Enqueuing…" : "Analysing…"}</> : "🔍 Scan URL"}
      </button>

      {/* Status */}
      {jobId && phase === "processing" && (
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
          <Spinner size={3} />
          <span>Job <code className="text-sky-400">{jobId.slice(0, 8)}…</code> — TinyFish analysing…</span>
        </div>
      )}

      {/* Result */}
      {phase === "done" && result && (
        <div className="flex flex-col gap-3 bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center justify-between">
            <RiskBadge risk={result.risk} large />
            <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300">
              New scan
            </button>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{result.explanation}</p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Job: <code className="text-slate-400">{result.jobId.slice(0, 8)}…</code></span>
            <span>·</span>
            <span>{new Date(result.createdAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="bg-red-950/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-300 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button onClick={reset} className="text-red-500 hover:text-red-300 shrink-0">✕</button>
        </div>
      )}
    </div>
  );
}
